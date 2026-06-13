-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- CHECKPOINT 3 - PROCEDURES  (items f, g, h)
-- ----------------------------------------------------------------------------
-- Depends on: cp3_01_functions.sql (distancia_linear) and
--             cp3_00_schema.sql   (seq_driver_payment, DISABLED status).
-- The status history of a trip request is written automatically by the
-- update_pedido trigger (cp3_03_triggers.sql), so these procedures only
-- change the business tables and let the trigger keep the audit trail.
--
-- Exception codes:
--   -20803 Vehicle type does not exist
--   -20806 Invalid time interval
--   -20810 No drivers available
--   -20815 Trip request code does not exist
--   -20816 Invalid amount
--   -20817 Invalid interval
-- ============================================================================

SET DEFINE OFF

-- ============================================================================
-- f) aloca_motorista(cod_pedido_viagem, raio)
-- ----------------------------------------------------------------------------
-- Allocates, to the given trip request, the available driver who drives the
-- vehicle type asked in the request and is closest to the pickup point (the
-- client's location), within "raio" km. If two of the closest drivers are
-- less than 1 km apart, the one who has been longest without a trip is chosen.
-- Drivers that previously rejected this request are ignored.
-- Raises -20815 if the request does not exist, -20810 if nobody qualifies.
-- ============================================================================
CREATE OR REPLACE PROCEDURE aloca_motorista (
   cod_pedido_viagem NUMBER,
   raio              NUMBER
) IS
   v_client_id  trip_request.client_id%TYPE;
   v_vtype      trip_request.vehicle_type%TYPE;
   v_clat       client.latitude%TYPE;
   v_clong      client.longitude%TYPE;
   v_chosen     driver.driver_id%TYPE;
   v_vehicle    vehicle.vehicle_id%TYPE;
BEGIN
   -- 1. Validate the request and read what we need from it
   BEGIN
      SELECT client_id, vehicle_type
        INTO v_client_id, v_vtype
        FROM trip_request
       WHERE request_id = cod_pedido_viagem;
   EXCEPTION
      WHEN no_data_found THEN
         raise_application_error(-20815, 'Codigo pedido de viagem inexistente: ' || cod_pedido_viagem);
   END;

   -- Pickup point = current client location
   SELECT latitude, longitude
     INTO v_clat, v_clong
     FROM client
    WHERE client_id = v_client_id;

   -- 2. Choose the best driver:
   --    - AVAILABLE, drives the requested vehicle type, within the radius
   --    - did not previously reject this request
   --    - closest; ties (< 1 km) broken by "longest time without a trip"
   BEGIN
      SELECT driver_id
        INTO v_chosen
        FROM (
         SELECT driver_id
           FROM (
            SELECT d.driver_id,
                   distancia_linear(v_clat, v_clong, d.latitude, d.longitude) AS dist,
                   (
                      SELECT MAX(t.end_date)
                        FROM trip t
                       WHERE t.driver_id = d.driver_id
                         AND t.status = 'COMPLETED'
                   ) AS last_trip,
                   MIN(distancia_linear(v_clat, v_clong, d.latitude, d.longitude)) OVER () AS min_dist
              FROM driver d
             WHERE d.status = 'AVAILABLE'
               AND d.latitude IS NOT NULL
               AND d.longitude IS NOT NULL
               AND distancia_linear(v_clat, v_clong, d.latitude, d.longitude) <= raio
               -- drives the requested vehicle type
               AND EXISTS (
                  SELECT 1
                    FROM driver_vehicle dv
                    JOIN vehicle ve ON ve.vehicle_id = dv.vehicle_id
                   WHERE dv.driver_id = d.driver_id
                     AND ve.vehicle_type = v_vtype
               )
               -- has not rejected this request before
               AND NOT EXISTS (
                  SELECT 1
                    FROM trip_process tp
                   WHERE tp.request_id = cod_pedido_viagem
                     AND tp.driver_id = d.driver_id
                     AND tp.status = 'REJECTED'
               )
         )
          WHERE dist <= min_dist + 1            -- within 1 km of the closest
          ORDER BY last_trip ASC NULLS FIRST,   -- longest without a trip first
                   dist ASC
      )
       WHERE rownum = 1;
   EXCEPTION
      WHEN no_data_found THEN
         raise_application_error(-20810, 'Nao ha motoristas disponiveis para o pedido ' || cod_pedido_viagem);
   END;

   -- 3. Pick a vehicle of the requested type owned by the chosen driver
   SELECT MIN(ve.vehicle_id)
     INTO v_vehicle
     FROM driver_vehicle dv
     JOIN vehicle ve ON ve.vehicle_id = dv.vehicle_id
    WHERE dv.driver_id = v_chosen
      AND ve.vehicle_type = v_vtype;

   -- 4. Allocate. The status change is logged by the update_pedido trigger.
   UPDATE trip_request
      SET driver_id = v_chosen,
          vehicle_id = v_vehicle,
          status = 'ASSIGNED'
    WHERE request_id = cod_pedido_viagem;

   dbms_output.put_line('Pedido ' || cod_pedido_viagem || ' alocado ao motorista ' || v_chosen);
END aloca_motorista;
/
SHOW ERRORS

-- ============================================================================
-- g) paga_aos_motoristas(montanteMinimo, intervaloMinimo)
-- ----------------------------------------------------------------------------
-- For every driver whose amount still to receive is greater than
-- montanteMinimo, OR whose time since the last payment is greater than
-- intervaloMinimo (days), registers a payment for everything billed since the
-- last payment, minus the platform commission. A payment is only registered
-- if its net value is greater than 2 EUR.
-- Raises -20816 if the amount is invalid, -20817 if the interval is invalid.
-- ============================================================================
CREATE OR REPLACE PROCEDURE paga_aos_motoristas (
   montanteminimo NUMBER,
   intervalominimo NUMBER
) IS
   v_last_end    DATE;
   v_pending     NUMBER;
   v_period_st   DATE;
   v_days        NUMBER;
   v_pct         NUMBER;
   v_commission  NUMBER;
   v_net         NUMBER;
   v_count       NUMBER := 0;
BEGIN
   -- Validate arguments
   IF montanteminimo IS NULL OR montanteminimo < 0 THEN
      raise_application_error(-20816, 'Montante invalido: ' || montanteminimo);
   END IF;
   IF intervalominimo IS NULL OR intervalominimo < 0 THEN
      raise_application_error(-20817, 'Intervalo invalido: ' || intervalominimo);
   END IF;

   FOR r IN (
      SELECT driver_id
        FROM driver
       WHERE status <> 'DISABLED'
   ) LOOP
      -- End of the last payment already made to this driver (if any)
      SELECT MAX(period_end)
        INTO v_last_end
        FROM driver_payment
       WHERE driver_id = r.driver_id;

      -- Amount billed since the last payment (or since the beginning)
      SELECT nvl(SUM(t.value), 0),
             nvl(MIN(t.start_date), SYSDATE)
        INTO v_pending, v_period_st
        FROM trip t
       WHERE t.driver_id = r.driver_id
         AND t.status = 'COMPLETED'
         AND t.end_date > nvl(v_last_end, DATE '1900-01-01');

      -- Days since the last payment (large number if never paid)
      v_days := trunc(SYSDATE) - trunc(nvl(v_last_end, DATE '1900-01-01'));

      -- The period of this payment starts where the previous one ended
      IF v_last_end IS NOT NULL THEN
         v_period_st := v_last_end;
      END IF;

      -- Should this driver be paid now?
      IF v_pending > 0
         AND ( v_pending > montanteminimo OR v_days > intervalominimo ) THEN

         -- Commission percentage from the tariff of the driver's vehicle
         SELECT nvl(MAX(ta.commission_pct), 15)
           INTO v_pct
           FROM driver_vehicle dv
           JOIN vehicle ve ON ve.vehicle_id = dv.vehicle_id
           JOIN tariff ta ON ta.fuel_type = ve.fuel_type
          WHERE dv.driver_id = r.driver_id;

         v_commission := round(v_pending * v_pct / 100, 2);
         v_net := v_pending - v_commission;

         -- Only register if the net value is worth it (> 2 EUR)
         IF v_net > 2 THEN
            INSERT INTO driver_payment (
               payment_id, driver_id, period_start, period_end,
               value, commission, net_value, payment_date
            ) VALUES (
               seq_driver_payment.NEXTVAL, r.driver_id, v_period_st, SYSDATE,
               v_pending, v_commission, v_net, SYSDATE
            );
            v_count := v_count + 1;
         END IF;
      END IF;
   END LOOP;

   dbms_output.put_line('Pagamentos registados: ' || v_count);
END paga_aos_motoristas;
/
SHOW ERRORS

-- ============================================================================
-- h) cancela_motoristas(tipoVeiculo, dataInicio, dataFim)
-- ----------------------------------------------------------------------------
-- Looks at the rating drivers received on their trips and deactivates (status
-- DISABLED) the still-active drivers of the given vehicle type that got a
-- rating of 1 in the MAJORITY of their trips during 3 consecutive months, or
-- during 4 interpolated (non-consecutive) months, inside [dataInicio,dataFim].
-- Only drivers with more than 20 trips in each of those months are considered.
-- Raises -20803 for an invalid vehicle type, -20806 for an invalid interval.
-- ============================================================================
CREATE OR REPLACE PROCEDURE cancela_motoristas (
   tipoveiculo VARCHAR2,
   datainicio  DATE,
   datafim     DATE
) IS
   v_prev_month DATE;
   v_streak     NUMBER;
   v_max_streak NUMBER;
   v_total_bad  NUMBER;
   v_count      NUMBER := 0;
BEGIN
   -- Validate vehicle type
   IF tipoveiculo NOT IN ( 'AI', 'NOAI' ) THEN
      raise_application_error(-20803, 'Codigo tipo de veiculo inexistente: ' || tipoveiculo);
   END IF;

   -- Validate the interval
   IF datainicio IS NULL OR datafim IS NULL OR datafim < datainicio THEN
      raise_application_error(-20806, 'Invalido intervalo temporal.');
   END IF;

   -- For each still-active driver of the requested vehicle type ...
   FOR d IN (
      SELECT DISTINCT dr.driver_id
        FROM driver dr
        JOIN driver_vehicle dv ON dv.driver_id = dr.driver_id
        JOIN vehicle ve ON ve.vehicle_id = dv.vehicle_id
       WHERE dr.status <> 'DISABLED'
         AND ve.vehicle_type = tipoveiculo
   ) LOOP
      v_prev_month := NULL;
      v_streak     := 0;
      v_max_streak := 0;
      v_total_bad  := 0;

      -- ... go through the "bad months": months with > 20 trips where the
      -- majority of the rated trips got a score of 1, ordered chronologically.
      FOR m IN (
         SELECT trunc(t.start_date, 'MM') AS mes,
                COUNT(*) AS num_trips,
                SUM(CASE WHEN cr.score = 1 THEN 1 ELSE 0 END) AS num_one,
                COUNT(cr.score) AS num_rated
           FROM trip t
           LEFT JOIN client_rating cr ON cr.trip_id = t.request_id
          WHERE t.driver_id = d.driver_id
            AND t.status = 'COMPLETED'
            AND t.start_date BETWEEN datainicio AND datafim
          GROUP BY trunc(t.start_date, 'MM')
         HAVING COUNT(*) > 20
            AND SUM(CASE WHEN cr.score = 1 THEN 1 ELSE 0 END) > COUNT(cr.score) / 2
          ORDER BY trunc(t.start_date, 'MM')
      ) LOOP
         v_total_bad := v_total_bad + 1;

         -- consecutive run of bad months
         IF v_prev_month IS NOT NULL
            AND months_between(m.mes, v_prev_month) = 1 THEN
            v_streak := v_streak + 1;
         ELSE
            v_streak := 1;
         END IF;

         IF v_streak > v_max_streak THEN
            v_max_streak := v_streak;
         END IF;

         v_prev_month := m.mes;
      END LOOP;

      -- 3 consecutive bad months OR 4 interpolated -> deactivate
      IF v_max_streak >= 3 OR v_total_bad >= 4 THEN
         UPDATE driver
            SET status = 'DISABLED'
          WHERE driver_id = d.driver_id;
         v_count := v_count + 1;
         dbms_output.put_line('Motorista ' || d.driver_id || ' desativado.');
      END IF;
   END LOOP;

   dbms_output.put_line('Motoristas desativados: ' || v_count);
END cancela_motoristas;
/
SHOW ERRORS

PROMPT === CP3 procedures created ===

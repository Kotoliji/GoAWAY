-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- ADDITIONAL OBJECTS - extra functions, procedures and triggers
-- ----------------------------------------------------------------------------
-- Two themed groups of objects built on top of the core layer:
--   * Group A (earnings & ratings): driver monthly net earnings, payment
--     registration for a driver, real-time driver-rating update.
--   * Group B (geo & lifecycle): trip-request distance estimate, request
--     cancellation, request status-transition guard.
--
-- Some of these reuse the core helpers distancia_linear and aloca_motorista
-- instead of duplicating their logic.
--
-- Depends on: 00_schema_changes.sql, 01_functions.sql, 03_triggers.sql.
-- ============================================================================

SET DEFINE OFF

-- ############################################################################
-- ## GROUP A: EARNINGS & RATINGS
-- ############################################################################

-- ============================================================================
-- n) FN_DRIVER_MONTHLY_NET(idMotorista, mes, ano) RETURN NUMBER
-- ----------------------------------------------------------------------------
-- Net amount a driver earned in a given month/year: the sum of the value of
-- his completed trips minus the platform commission (taken from the tariff of
-- his vehicle's fuel type). Useful for monthly statements and payroll.
-- Distinct from valor_medio_diario(b): that one returns the GROSS billed for
-- an arbitrary date range; this returns the NET for a calendar month.
-- Raises -20801 (driver) and -20806 (invalid month).
-- ============================================================================
CREATE OR REPLACE FUNCTION FN_DRIVER_MONTHLY_NET (
   idmotorista NUMBER,
   mes         NUMBER,
   ano         NUMBER
) RETURN NUMBER IS
   v_exists NUMBER;
   v_gross  NUMBER;
   v_pct    NUMBER;
BEGIN
   SELECT COUNT(*) INTO v_exists FROM driver WHERE driver_id = idmotorista;
   IF v_exists = 0 THEN
      raise_application_error(-20801, 'Codigo de motorista inexistente: ' || idmotorista);
   END IF;

   IF mes IS NULL OR mes < 1 OR mes > 12 OR ano IS NULL THEN
      raise_application_error(-20806, 'Invalido intervalo temporal (mes/ano).');
   END IF;

   -- Gross billed in that calendar month
   SELECT nvl(SUM(t.value), 0)
     INTO v_gross
     FROM trip t
    WHERE t.driver_id = idmotorista
      AND t.status = 'COMPLETED'
      AND EXTRACT(MONTH FROM t.start_date) = mes
      AND EXTRACT(YEAR FROM t.start_date) = ano;

   -- Commission percentage of the driver's vehicle
   SELECT nvl(MAX(ta.commission_pct), 15)
     INTO v_pct
     FROM driver_vehicle dv
     JOIN vehicle ve ON ve.vehicle_id = dv.vehicle_id
     JOIN tariff ta ON ta.fuel_type = ve.fuel_type
    WHERE dv.driver_id = idmotorista;

   RETURN round(v_gross * ( 1 - v_pct / 100 ), 2);
END FN_DRIVER_MONTHLY_NET;
/
SHOW ERRORS

-- ============================================================================
-- o) SP_REGISTER_DRIVER_PAYMENT(idMotorista, dataInicio, dataFim)
-- ----------------------------------------------------------------------------
-- Registers, for ONE driver and an explicit date range, a single payment for
-- everything billed in that range, deducting the commission. Distinct from
-- paga_aos_motoristas(g), which is a bulk run over ALL drivers driven by
-- threshold rules. Raises -20801 (driver) and -20811 (invalid period).
-- ============================================================================
CREATE OR REPLACE PROCEDURE SP_REGISTER_DRIVER_PAYMENT (
   idmotorista NUMBER,
   datainicio  DATE,
   datafim     DATE
) IS
   v_exists     NUMBER;
   v_gross      NUMBER;
   v_pct        NUMBER;
   v_commission NUMBER;
   v_net        NUMBER;
BEGIN
   SELECT COUNT(*) INTO v_exists FROM driver WHERE driver_id = idmotorista;
   IF v_exists = 0 THEN
      raise_application_error(-20801, 'Codigo de motorista inexistente: ' || idmotorista);
   END IF;

   IF datainicio IS NULL OR datafim IS NULL OR datafim < datainicio THEN
      raise_application_error(-20811, 'Periodo invalido.');
   END IF;

   SELECT nvl(SUM(t.value), 0)
     INTO v_gross
     FROM trip t
    WHERE t.driver_id = idmotorista
      AND t.status = 'COMPLETED'
      AND t.start_date >= datainicio
      AND t.end_date <= datafim;

   IF v_gross <= 0 THEN
      dbms_output.put_line('Sem valores a pagar ao motorista ' || idmotorista || ' no periodo.');
      RETURN;
   END IF;

   SELECT nvl(MAX(ta.commission_pct), 15)
     INTO v_pct
     FROM driver_vehicle dv
     JOIN vehicle ve ON ve.vehicle_id = dv.vehicle_id
     JOIN tariff ta ON ta.fuel_type = ve.fuel_type
    WHERE dv.driver_id = idmotorista;

   v_commission := round(v_gross * v_pct / 100, 2);
   v_net := v_gross - v_commission;

   INSERT INTO driver_payment (
      payment_id, driver_id, period_start, period_end,
      value, commission, net_value, payment_date
   ) VALUES (
      seq_driver_payment.NEXTVAL, idmotorista, datainicio, datafim,
      v_gross, v_commission, v_net, SYSDATE
   );

   dbms_output.put_line('Pagamento de ' || v_net || ' EUR (liquido) registado ao motorista ' || idmotorista);
END SP_REGISTER_DRIVER_PAYMENT;
/
SHOW ERRORS

-- ============================================================================
-- p) TRG_DRIVER_RATING_UPDATE  (AFTER INSERT ON client_rating)
-- ----------------------------------------------------------------------------
-- When a client rates a trip, the rated DRIVER's received-rating counters are
-- recalculated in real time (avg_score and num_ratings). Complementary to the
-- mandatory cliente_Avalia(j), which keeps the CLIENT side (ratings given).
-- Keeping driver.avg_score current matters because the assignment algorithm
-- uses it to pick the best driver.
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_DRIVER_RATING_UPDATE
   AFTER INSERT ON client_rating
   FOR EACH ROW
DECLARE
   v_driver_id trip.driver_id%TYPE;
   v_count     NUMBER;
   v_avg       NUMBER;
BEGIN
   -- Driver of the rated trip
   SELECT driver_id INTO v_driver_id FROM trip WHERE request_id = :new.trip_id;

   IF v_driver_id IS NOT NULL THEN
      SELECT nvl(num_ratings, 0), nvl(avg_score, 0)
        INTO v_count, v_avg
        FROM driver
       WHERE driver_id = v_driver_id;

      UPDATE driver
         SET num_ratings = v_count + 1,
             avg_score = ( v_avg * v_count + :new.score ) / ( v_count + 1 )
       WHERE driver_id = v_driver_id;
   END IF;
END TRG_DRIVER_RATING_UPDATE;
/
SHOW ERRORS

-- ############################################################################
-- ## GROUP B: GEO & LIFECYCLE
-- ############################################################################

-- ============================================================================
-- n) FN_REQUEST_DISTANCE(p_request_id) RETURN NUMBER
-- ----------------------------------------------------------------------------
-- Estimated linear distance (km) of a trip request: from the pickup point
-- (the client's location) to the requested destination. Built on top of the
-- mandatory distancia_linear(m) -- which is exactly the Haversine function
-- proposed by this member in checkpoint 2. Used to show the client an
-- estimated trip length / price before confirming. Raises -20815 if the
-- request does not exist.
-- ============================================================================
CREATE OR REPLACE FUNCTION FN_REQUEST_DISTANCE (
   p_request_id NUMBER
) RETURN NUMBER IS
   v_clat  client.latitude%TYPE;
   v_clong client.longitude%TYPE;
   v_dlat  trip_request.dest_lat%TYPE;
   v_dlong trip_request.dest_long%TYPE;
BEGIN
   BEGIN
      SELECT c.latitude, c.longitude, tr.dest_lat, tr.dest_long
        INTO v_clat, v_clong, v_dlat, v_dlong
        FROM trip_request tr
        JOIN client c ON c.client_id = tr.client_id
       WHERE tr.request_id = p_request_id;
   EXCEPTION
      WHEN no_data_found THEN
         raise_application_error(-20815, 'Codigo pedido de viagem inexistente: ' || p_request_id);
   END;

   RETURN distancia_linear(v_clat, v_clong, v_dlat, v_dlong);
END FN_REQUEST_DISTANCE;
/
SHOW ERRORS

-- ============================================================================
-- o) SP_CANCEL_REQUEST(p_request_id)
-- ----------------------------------------------------------------------------
-- Registers a client cancellation of a trip request: sets the request to
-- CANCELLED, stamps the cancellation date and charges the cancellation fee
-- (taken from the tariff of the request's fuel type and kept in
-- proposed_value, the same convention used by VIEW_D in checkpoint 2).
-- The status change itself is logged by the update_pedido trigger.
-- Raises -20815 if the request does not exist, -20821 if it cannot be
-- cancelled (already completed or already cancelled).
-- ============================================================================
CREATE OR REPLACE PROCEDURE SP_CANCEL_REQUEST (
   p_request_id NUMBER
) IS
   v_status trip_request.status%TYPE;
   v_fuel   trip_request.fuel_type%TYPE;
   v_fee    NUMBER;
BEGIN
   BEGIN
      SELECT status, fuel_type
        INTO v_status, v_fuel
        FROM trip_request
       WHERE request_id = p_request_id;
   EXCEPTION
      WHEN no_data_found THEN
         raise_application_error(-20815, 'Codigo pedido de viagem inexistente: ' || p_request_id);
   END;

   IF v_status IN ( 'COMPLETED', 'CANCELLED' ) THEN
      raise_application_error(-20821, 'Pedido nao pode ser cancelado (estado ' || v_status || ').');
   END IF;

   -- Cancellation fee from the matching tariff (fallback 2.5 EUR)
   SELECT nvl(MAX(cancellation_fee), 2.5)
     INTO v_fee
     FROM tariff
    WHERE fuel_type = v_fuel;

   UPDATE trip_request
      SET status = 'CANCELLED',
          cancellation_date = SYSDATE,
          proposed_value = v_fee
    WHERE request_id = p_request_id;

   dbms_output.put_line('Pedido ' || p_request_id || ' cancelado. Taxa: ' || v_fee || ' EUR.');
END SP_CANCEL_REQUEST;
/
SHOW ERRORS

-- ============================================================================
-- p) TRG_REQUEST_STATUS_GUARD  (BEFORE UPDATE ON trip_request)
-- ----------------------------------------------------------------------------
-- Guards the trip-request lifecycle so it can only move through valid state
-- transitions: a terminal state (COMPLETED/CANCELLED) can no longer change,
-- and a brand-new REQUESTED request cannot jump straight to PICKED_UP or
-- COMPLETED without being assigned/accepted first. The full audit history is
-- written separately by the mandatory update_pedido(l); this trigger is the
-- validation half of that member's checkpoint-2 lifecycle proposal.
-- Raises -20822 on an invalid transition.
-- ============================================================================
CREATE OR REPLACE TRIGGER TRG_REQUEST_STATUS_GUARD
   BEFORE UPDATE OF status ON trip_request
   FOR EACH ROW
   WHEN ( new.status <> old.status )
BEGIN
   -- A terminal state cannot change anymore
   IF :old.status IN ( 'COMPLETED', 'CANCELLED' ) THEN
      raise_application_error(-20822,
         'Transicao de estado invalida: ' || :old.status || ' -> ' || :new.status);
   END IF;

   -- A fresh request cannot skip the assignment/acceptance steps
   IF :old.status = 'REQUESTED'
      AND :new.status IN ( 'PICKED_UP', 'COMPLETED' ) THEN
      raise_application_error(-20822,
         'Transicao de estado invalida: ' || :old.status || ' -> ' || :new.status);
   END IF;
END TRG_REQUEST_STATUS_GUARD;
/
SHOW ERRORS

PROMPT === CP3 individual member objects created ===




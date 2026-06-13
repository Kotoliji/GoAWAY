-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- CHECKPOINT 3 - TRIGGERS  (items i, j, k, l)
-- ----------------------------------------------------------------------------
-- Depends on: cp3_00_schema.sql (seq_trip_process, DRIVER_SCHEDULE turno
--             counters, DISABLED status).
--
-- Exception codes:
--   -20804 Trip does not exist
--   -20818 On a trip, cannot go offline
--   -20819 A driver cannot rate his own trip (as a client)   [extra]
--   -20820 A trip can only be rated after it is completed     [extra]
-- ============================================================================

SET DEFINE OFF

-- ============================================================================
-- i) update_status  (BEFORE UPDATE ON driver)
-- ----------------------------------------------------------------------------
-- When a driver switches his availability to OFFLINE:
--   * if he is in the middle of a trip (a request already PICKED_UP), the
--     change is blocked with -20818;
--   * otherwise he is detached from any request that was assigned/accepted
--     but not yet started (passenger not picked up), which goes back to the
--     pool as REQUESTED.
-- ============================================================================
CREATE OR REPLACE TRIGGER update_status
   BEFORE UPDATE OF status ON driver
   FOR EACH ROW
   WHEN ( new.status = 'OFFLINE' AND old.status != 'OFFLINE' )
DECLARE
   v_in_trip NUMBER;
BEGIN
   -- Is there a trip already in progress (passenger picked up)?
   SELECT COUNT(*)
     INTO v_in_trip
     FROM trip_request
    WHERE driver_id = :new.driver_id
      AND status = 'PICKED_UP';

   IF v_in_trip > 0 THEN
      raise_application_error(-20818, 'Em viagem, nao e possivel ficar offline.');
   END IF;

   -- Detach from requests assigned/accepted but not started yet
   UPDATE trip_request
      SET driver_id = NULL,
          status = 'REQUESTED'
    WHERE driver_id = :new.driver_id
      AND status IN ( 'ASSIGNED', 'ACCEPTED' );
END update_status;
/
SHOW ERRORS

-- ============================================================================
-- j) cliente_Avalia  (BEFORE INSERT ON client_rating)
-- ----------------------------------------------------------------------------
-- Validates a client's rating after a trip ends:
--   * the trip must be completed (-20820);
--   * a driver cannot rate his own trip posing as a client, detected by the
--     driver and client sharing the same e-mail (-20819);
-- and keeps the client's counters up to date: number of evaluations the
-- client made and the average score he attributed.
-- ============================================================================
CREATE OR REPLACE TRIGGER cliente_Avalia
   BEFORE INSERT ON client_rating
   FOR EACH ROW
DECLARE
   v_driver_id  trip.driver_id%TYPE;
   v_status     trip.status%TYPE;
   v_drv_email  driver.email%TYPE;
   v_cli_email  client.email%TYPE;
   v_old_count  NUMBER;
   v_old_avg    NUMBER;
BEGIN
   -- Trip must exist and be completed
   BEGIN
      SELECT driver_id, status
        INTO v_driver_id, v_status
        FROM trip
       WHERE request_id = :new.trip_id;
   EXCEPTION
      WHEN no_data_found THEN
         raise_application_error(-20804, 'Viagem inexistente: ' || :new.trip_id);
   END;

   IF v_status <> 'COMPLETED' THEN
      raise_application_error(-20820, 'So e possivel avaliar uma viagem terminada.');
   END IF;

   -- A driver may not rate his own trip as a client (same person = same e-mail)
   IF v_driver_id IS NOT NULL THEN
      SELECT email INTO v_drv_email FROM driver WHERE driver_id = v_driver_id;
      SELECT email INTO v_cli_email FROM client WHERE client_id = :new.client_id;
      IF v_drv_email = v_cli_email THEN
         raise_application_error(-20819, 'Um motorista nao pode avaliar a sua propria viagem.');
      END IF;
   END IF;

   -- Update the client's "given ratings" counters incrementally
   SELECT nvl(num_evaluations, 0), nvl(avg_score, 0)
     INTO v_old_count, v_old_avg
     FROM client
    WHERE client_id = :new.client_id;

   UPDATE client
      SET num_evaluations = v_old_count + 1,
          avg_score = ( v_old_avg * v_old_count + :new.score ) / ( v_old_count + 1 )
    WHERE client_id = :new.client_id;
END cliente_Avalia;
/
SHOW ERRORS

-- ============================================================================
-- k) viagem_Terminada  (AFTER UPDATE ON trip)
-- ----------------------------------------------------------------------------
-- After a trip is completed it:
--   * sets the driver back to AVAILABLE (if he was ON_TRIP);
--   * updates the current shift (turno) in DRIVER_SCHEDULE for that driver,
--     vehicle and week day: number of trips, total duration (minutes) and
--     total amount to bill in that shift.
-- ============================================================================
CREATE OR REPLACE TRIGGER viagem_Terminada
   AFTER UPDATE OF status ON trip
   FOR EACH ROW
   WHEN ( new.status = 'COMPLETED' AND old.status != 'COMPLETED' )
DECLARE
   v_duration NUMBER;
BEGIN
   -- Free the driver
   UPDATE driver
      SET status = 'AVAILABLE'
    WHERE driver_id = :new.driver_id
      AND status = 'ON_TRIP';

   -- Duration of this trip in minutes
   v_duration := round((:new.end_date - :new.start_date) * 24 * 60);

   -- Accumulate the trip into the current shift (matched by week day)
   UPDATE driver_schedule
      SET trips_count = nvl(trips_count, 0) + 1,
          total_duration_min = nvl(total_duration_min, 0) + nvl(v_duration, 0),
          total_value = nvl(total_value, 0) + nvl(:new.value, 0)
    WHERE driver_id = :new.driver_id
      AND vehicle_id = :new.vehicle_id
      AND day_of_week = to_number(to_char(:new.end_date, 'D'));
END viagem_Terminada;
/
SHOW ERRORS

-- ============================================================================
-- l) update_pedido  (AFTER UPDATE ON trip_request)
-- ----------------------------------------------------------------------------
-- Whenever the state (or the assigned driver) of a trip request changes
-- (REQUESTED -> ASSIGNED -> ACCEPTED -> PICKED_UP -> COMPLETED/CANCELLED),
-- a history row is written to TRIP_PROCESS with the new state, the driver
-- involved and the exact moment of the change. This is the audit trail of
-- the request lifecycle.
-- ============================================================================
CREATE OR REPLACE TRIGGER update_pedido
   AFTER UPDATE ON trip_request
   FOR EACH ROW
BEGIN
   -- Only log when something meaningful changed (status or assigned driver)
   IF :new.status <> :old.status
      OR nvl(:new.driver_id, -1) <> nvl(:old.driver_id, -1) THEN

      INSERT INTO trip_process (
         process_id, request_id, driver_id, status,
         proposed_value, notification_date, change_date
      ) VALUES (
         seq_trip_process.NEXTVAL, :new.request_id, :new.driver_id, :new.status,
         :new.proposed_value, SYSDATE, SYSDATE
      );
   END IF;
END update_pedido;
/
SHOW ERRORS

PROMPT === CP3 triggers created ===

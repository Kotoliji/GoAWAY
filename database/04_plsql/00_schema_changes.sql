-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- CHECKPOINT 3 - Schema changes required by the PL/SQL layer
-- ----------------------------------------------------------------------------
-- This script extends the CP1/CP2 schema with the few structures the
-- procedures, functions and triggers of CP3 need:
--   * Sequences to generate primary keys from PL/SQL (Oracle has no
--     auto-increment in 11g/XE, so we use sequences).
--   * "Shift / turno" counters on DRIVER_SCHEDULE, updated by the
--     viagem_Terminada trigger (item k).
--   * A new DISABLED driver status used by the cancela_motoristas
--     procedure (item h) to deactivate badly rated drivers.
-- Run this BEFORE the functions / procedures / triggers scripts.
-- ============================================================================

SET DEFINE OFF

-- ----------------------------------------------------------------------------
-- 1. Sequences for primary keys generated at runtime
--    Started well above the highest id currently loaded by insert_data.sql
--    (trip_process <= 24, driver_payment <= 10) to avoid PK collisions.
-- ----------------------------------------------------------------------------
BEGIN
   EXECUTE IMMEDIATE 'DROP SEQUENCE seq_trip_process';
EXCEPTION
   WHEN OTHERS THEN
      IF sqlcode != -2289 THEN -- ORA-02289: sequence does not exist
         RAISE;
      END IF;
END;
/

CREATE SEQUENCE seq_trip_process
   START WITH 1000
   INCREMENT BY 1
   NOCACHE
   NOCYCLE;

BEGIN
   EXECUTE IMMEDIATE 'DROP SEQUENCE seq_driver_payment';
EXCEPTION
   WHEN OTHERS THEN
      IF sqlcode != -2289 THEN
         RAISE;
      END IF;
END;
/

CREATE SEQUENCE seq_driver_payment
   START WITH 1000
   INCREMENT BY 1
   NOCACHE
   NOCYCLE;

-- ----------------------------------------------------------------------------
-- 2. "Turno" (work shift) counters on DRIVER_SCHEDULE
--    Each DRIVER_SCHEDULE row represents an online period (shift) of a driver
--    with a given vehicle on a given week day. The viagem_Terminada trigger
--    keeps these running totals updated whenever a trip is completed, so the
--    current shift always knows how many trips were done, their total
--    duration (minutes) and the total amount billed in that shift.
--    Guarded by a PL/SQL block so the script can be re-run safely.
-- ----------------------------------------------------------------------------
DECLARE
   v_exists NUMBER;
BEGIN
   SELECT COUNT(*)
     INTO v_exists
     FROM user_tab_columns
    WHERE table_name = 'DRIVER_SCHEDULE'
      AND column_name = 'TRIPS_COUNT';

   IF v_exists = 0 THEN
      EXECUTE IMMEDIATE 'ALTER TABLE driver_schedule ADD (
         trips_count        NUMBER DEFAULT 0,
         total_duration_min NUMBER DEFAULT 0,
         total_value        NUMBER DEFAULT 0
      )';
   END IF;
END;
/

-- ----------------------------------------------------------------------------
-- 3. New DISABLED status for drivers
--    cancela_motoristas (item h) deactivates drivers with a sustained record
--    of 1-star trips. The original CHECK only allowed OFFLINE / AVAILABLE /
--    ON_TRIP, so we widen it to include DISABLED.
-- ----------------------------------------------------------------------------
BEGIN
   EXECUTE IMMEDIATE 'ALTER TABLE driver DROP CONSTRAINT ck_driver_status';
EXCEPTION
   WHEN OTHERS THEN
      IF sqlcode != -2443 THEN -- ORA-02443: cannot drop constraint - does not exist
         RAISE;
      END IF;
END;
/

ALTER TABLE driver
   ADD CONSTRAINT ck_driver_status
      CHECK ( status IN ( 'OFFLINE', 'AVAILABLE', 'ON_TRIP', 'DISABLED' ) );

PROMPT === CP3 schema changes applied ===

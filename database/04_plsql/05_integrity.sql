-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- CHECKPOINT 3 - item q) DATA INTEGRITY MECHANISMS
-- ----------------------------------------------------------------------------
-- What the base schema (CP1) already guarantees:
--   * Entity integrity: PRIMARY KEY on every table.
--   * Referential integrity: FOREIGN KEYs between all related tables.
--   * Domain integrity: CHECKs on statuses, genders, payment methods,
--     vehicle types, rating scores (1..5), schedule day (1..7), etc.
--
-- What it does NOT guarantee and is added here:
--   1. VALUE integrity   -> no negative money / distance / duration.
--   2. DATE-ORDER integrity (within a row) -> end after start, etc.
--   3. CONSISTENCY        -> payment net = gross - commission.
--   4. TEMPORAL integrity (needs SYSDATE) -> birth/registration not in the
--      future. CHECK constraints cannot reference SYSDATE, so a trigger is used.
--
-- Cross-row / cross-table / state-machine integrity is enforced by the PL/SQL
-- triggers already delivered in this checkpoint:
--   * cliente_Avalia        - a trip can only be rated after it is COMPLETED,
--                             and a driver cannot rate his own trip.
--   * update_status         - a driver cannot go OFFLINE during a trip.
--   * viagem_Terminada      - keeps the driver state consistent after a trip.
--   * TRG_REQUEST_STATUS_GUARD     - only valid request state transitions are allowed.
-- ============================================================================

SET DEFINE OFF

-- ----------------------------------------------------------------------------
-- Make the script re-runnable: drop the constraints/triggers it creates
-- (ignore "constraint does not exist" / "does not exist" errors).
-- ----------------------------------------------------------------------------
DECLARE
   PROCEDURE drop_cons (p_table VARCHAR2, p_name VARCHAR2) IS
   BEGIN
      EXECUTE IMMEDIATE 'ALTER TABLE ' || p_table || ' DROP CONSTRAINT ' || p_name;
   EXCEPTION
      WHEN OTHERS THEN
         IF sqlcode != -2443 THEN
            RAISE;
         END IF;
   END;
BEGIN
   drop_cons('trip',           'ck_trip_dates');
   drop_cons('trip',           'ck_trip_value');
   drop_cons('trip',           'ck_trip_distance');
   drop_cons('trip',           'ck_trip_pickup');
   drop_cons('trip_request',   'ck_req_cancel_date');
   drop_cons('trip_request',   'ck_req_pickup_date');
   drop_cons('trip_request',   'ck_req_proposed');
   drop_cons('driver_payment', 'ck_pay_period');
   drop_cons('driver_payment', 'ck_pay_values');
   drop_cons('driver_payment', 'ck_pay_consistency');
   drop_cons('tariff',         'ck_tariff_values');
   drop_cons('trip_preferences','ck_pref_extra_fee');
   drop_cons('driver_schedule','ck_sched_times');
   drop_cons('driver_schedule','ck_sched_counters');
END;
/

-- ----------------------------------------------------------------------------
-- 1 + 2 + 3. Row-level VALUE, DATE-ORDER and CONSISTENCY checks
-- ----------------------------------------------------------------------------

-- TRIP: no negative duration, value or distance; pickup within the trip
ALTER TABLE trip ADD CONSTRAINT ck_trip_dates
   CHECK ( end_date IS NULL OR start_date IS NULL OR end_date >= start_date );
ALTER TABLE trip ADD CONSTRAINT ck_trip_value
   CHECK ( value IS NULL OR value >= 0 );
ALTER TABLE trip ADD CONSTRAINT ck_trip_distance
   CHECK ( distance_km IS NULL OR distance_km >= 0 );
ALTER TABLE trip ADD CONSTRAINT ck_trip_pickup
   CHECK ( pickup_date IS NULL OR start_date IS NULL OR pickup_date >= start_date );

-- TRIP_REQUEST: cancellation / pickup not before the request; fee not negative
ALTER TABLE trip_request ADD CONSTRAINT ck_req_cancel_date
   CHECK ( cancellation_date IS NULL OR request_date IS NULL OR cancellation_date >= request_date );
ALTER TABLE trip_request ADD CONSTRAINT ck_req_pickup_date
   CHECK ( pickup_date IS NULL OR request_date IS NULL OR pickup_date >= request_date );
ALTER TABLE trip_request ADD CONSTRAINT ck_req_proposed
   CHECK ( proposed_value IS NULL OR proposed_value >= 0 );

-- DRIVER_PAYMENT: valid period, non-negative amounts, net = gross - commission
ALTER TABLE driver_payment ADD CONSTRAINT ck_pay_period
   CHECK ( period_end >= period_start );
ALTER TABLE driver_payment ADD CONSTRAINT ck_pay_values
   CHECK ( value >= 0 AND commission >= 0 AND net_value >= 0 );
ALTER TABLE driver_payment ADD CONSTRAINT ck_pay_consistency
   CHECK ( ABS(net_value - (value - commission)) <= 0.01 );

-- TARIFF: no negative prices/fees; commission is a valid percentage
ALTER TABLE tariff ADD CONSTRAINT ck_tariff_values
   CHECK ( price_per_km >= 0 AND price_per_minute >= 0 AND base_fee >= 0
       AND cancellation_fee >= 0 AND commission_pct BETWEEN 0 AND 100 );

-- TRIP_PREFERENCES: extra fee not negative
ALTER TABLE trip_preferences ADD CONSTRAINT ck_pref_extra_fee
   CHECK ( extra_fee IS NULL OR extra_fee >= 0 );

-- DRIVER_SCHEDULE: shift counters not negative (new columns, validated)
ALTER TABLE driver_schedule ADD CONSTRAINT ck_sched_counters
   CHECK ( trips_count >= 0 AND total_duration_min >= 0 AND total_value >= 0 );

-- DRIVER_SCHEDULE: a shift must end after it starts.
-- ENABLE NOVALIDATE: the rule is enforced for new/updated rows, but 3 legacy
-- CP2 rows that violate it are tolerated so the script does not fail.
ALTER TABLE driver_schedule ADD CONSTRAINT ck_sched_times
   CHECK ( end_time > start_time ) ENABLE NOVALIDATE;

-- ----------------------------------------------------------------------------
-- 4. TEMPORAL integrity (needs SYSDATE -> trigger, not a CHECK)
--    Birth dates must be in the past; a driver's registration cannot be in the
--    future. Raises -20809 (date must be earlier than the current date).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_valida_data_cliente
   BEFORE INSERT OR UPDATE ON client
   FOR EACH ROW
BEGIN
   IF :new.birth_date IS NOT NULL AND :new.birth_date >= trunc(SYSDATE) THEN
      raise_application_error(-20809, 'Data invalida. A data de nascimento deve ser anterior a data atual.');
   END IF;
END;
/
SHOW ERRORS

CREATE OR REPLACE TRIGGER trg_valida_data_motorista
   BEFORE INSERT OR UPDATE ON driver
   FOR EACH ROW
BEGIN
   IF :new.birth_date IS NOT NULL AND :new.birth_date >= trunc(SYSDATE) THEN
      raise_application_error(-20809, 'Data invalida. A data de nascimento deve ser anterior a data atual.');
   END IF;
   IF :new.registration_date IS NOT NULL AND :new.registration_date > SYSDATE THEN
      raise_application_error(-20809, 'Data invalida. A data de registo nao pode ser no futuro.');
   END IF;
END;
/
SHOW ERRORS

PROMPT === CP3 integrity mechanisms applied ===

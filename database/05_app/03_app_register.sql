-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- APPLICATION LAYER - self sign-up
-- ----------------------------------------------------------------------------
-- One call creates the business row (CLIENT, or DRIVER + VEHICLE) and the
-- APP_USER login together, so a new person can register from the app without
-- a pre-existing id. The caller commits (the API runs the block with
-- autoCommit), so a failure anywhere leaves nothing behind.
-- Errors surface as the usual ORA codes: ORA-00001 for a duplicate email or
-- plate, ORA-02290 for bad enum values, -20809 for a future birth date.
-- Depends on: 05_app/01_auth_tables.sql, 05_app/02_app_sequences.sql.
-- ============================================================================

SET DEFINE OFF

CREATE OR REPLACE PROCEDURE app_register_client (
   p_email          IN  VARCHAR2,
   p_password_hash  IN  VARCHAR2,
   p_name           IN  VARCHAR2,
   p_phone          IN  VARCHAR2,
   p_birth_date     IN  DATE,
   p_gender         IN  VARCHAR2,
   p_payment_method IN  VARCHAR2,
   o_user_id        OUT NUMBER,
   o_client_id      OUT NUMBER
) IS
BEGIN
   o_client_id := seq_client.NEXTVAL;
   INSERT INTO client (client_id, name, email, phone, birth_date, gender, payment_method)
   VALUES (o_client_id, p_name, p_email, p_phone, p_birth_date, p_gender, p_payment_method);

   o_user_id := seq_app_user.NEXTVAL;
   INSERT INTO app_user (user_id, email, password_hash, role, client_id)
   VALUES (o_user_id, p_email, p_password_hash, 'CLIENT', o_client_id);
END app_register_client;
/
SHOW ERRORS

-- A driver signs up with the vehicle they own; it is linked as OWNER so
-- aloca_motorista can match it by vehicle_type. New drivers start OFFLINE.
CREATE OR REPLACE PROCEDURE app_register_driver (
   p_email          IN  VARCHAR2,
   p_password_hash  IN  VARCHAR2,
   p_name           IN  VARCHAR2,
   p_phone          IN  VARCHAR2,
   p_birth_date     IN  DATE,
   p_license_number IN  VARCHAR2,
   p_plate          IN  VARCHAR2,
   p_brand          IN  VARCHAR2,
   p_model          IN  VARCHAR2,
   p_year           IN  NUMBER,
   p_fuel_type      IN  VARCHAR2,
   p_vehicle_type   IN  VARCHAR2,
   o_user_id        OUT NUMBER,
   o_driver_id      OUT NUMBER
) IS
   v_vehicle_id vehicle.vehicle_id%TYPE;
BEGIN
   o_driver_id := seq_driver.NEXTVAL;
   INSERT INTO driver (driver_id, name, email, phone, birth_date, license_number, status)
   VALUES (o_driver_id, p_name, p_email, p_phone, p_birth_date, p_license_number, 'OFFLINE');

   v_vehicle_id := seq_vehicle.NEXTVAL;
   INSERT INTO vehicle (vehicle_id, plate, brand, model, year, fuel_type, vehicle_type)
   VALUES (v_vehicle_id, UPPER(p_plate), p_brand, p_model, p_year, p_fuel_type, p_vehicle_type);

   INSERT INTO driver_vehicle (driver_id, vehicle_id, ownership)
   VALUES (o_driver_id, v_vehicle_id, 'OWNER');

   o_user_id := seq_app_user.NEXTVAL;
   INSERT INTO app_user (user_id, email, password_hash, role, driver_id)
   VALUES (o_user_id, p_email, p_password_hash, 'DRIVER', o_driver_id);
END app_register_driver;
/
SHOW ERRORS

PROMPT === TVDEPT sign-up procedures created ===

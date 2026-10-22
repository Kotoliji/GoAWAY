-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- APPLICATION LAYER - admin actions
-- ----------------------------------------------------------------------------
-- Depends on: 04_plsql (update_status trigger).
-- ============================================================================

SET DEFINE OFF

-- Disable a driver by hand, or re-enable one (back to OFFLINE). Disabling
-- goes through OFFLINE first so update_status applies its rules: refused
-- mid-trip (-20818), and ASSIGNED / ACCEPTED requests go back to the queue.
CREATE OR REPLACE PROCEDURE app_admin_set_driver_status (
   p_driver_id IN NUMBER,
   p_status    IN VARCHAR2
) IS
   v_status driver.status%TYPE;
BEGIN
   IF p_status NOT IN ( 'DISABLED', 'OFFLINE' ) THEN
      raise_application_error(-20822, 'Estado invalido: ' || p_status);
   END IF;

   BEGIN
      SELECT status INTO v_status FROM driver WHERE driver_id = p_driver_id FOR UPDATE;
   EXCEPTION
      WHEN no_data_found THEN
         raise_application_error(-20801, 'Motorista inexistente: ' || p_driver_id);
   END;

   IF p_status = 'DISABLED' AND v_status <> 'DISABLED' THEN
      IF v_status <> 'OFFLINE' THEN
         UPDATE driver SET status = 'OFFLINE' WHERE driver_id = p_driver_id;
      END IF;
      UPDATE driver SET status = 'DISABLED' WHERE driver_id = p_driver_id;
   ELSIF p_status = 'OFFLINE' AND v_status = 'DISABLED' THEN
      UPDATE driver SET status = 'OFFLINE' WHERE driver_id = p_driver_id;
   END IF;
END app_admin_set_driver_status;
/
SHOW ERRORS

PROMPT === TVDEPT admin procedures created ===

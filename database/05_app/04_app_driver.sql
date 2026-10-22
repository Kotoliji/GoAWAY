-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- APPLICATION LAYER - driver availability and request rejection
-- ----------------------------------------------------------------------------
-- Going OFFLINE needs no procedure: a plain status update fires update_status,
-- which blocks it mid-trip and hands ASSIGNED/ACCEPTED requests back.
-- Raises -20823 (driver disabled) and -20822 (request not assigned to driver).
-- Depends on: 04_plsql (aloca_motorista, update_pedido trigger).
-- ============================================================================

SET DEFINE OFF

-- Driver goes online at the given position. A driver already ON_TRIP only
-- gets the position update; a DISABLED one (cancela_motoristas) is refused.
CREATE OR REPLACE PROCEDURE app_driver_go_online (
   p_driver_id IN NUMBER,
   p_lat       IN NUMBER,
   p_long      IN NUMBER
) IS
   v_status driver.status%TYPE;
BEGIN
   SELECT status INTO v_status FROM driver WHERE driver_id = p_driver_id FOR UPDATE;

   IF v_status = 'DISABLED' THEN
      raise_application_error(-20823, 'Motorista desativado: ' || p_driver_id);
   END IF;

   UPDATE driver
      SET latitude  = p_lat,
          longitude = p_long,
          status    = CASE WHEN status = 'ON_TRIP' THEN status ELSE 'AVAILABLE' END
    WHERE driver_id = p_driver_id;
EXCEPTION
   WHEN no_data_found THEN
      raise_application_error(-20801, 'Motorista inexistente: ' || p_driver_id);
END app_driver_go_online;
/
SHOW ERRORS

-- The assigned driver declines a request. The REJECTED row in trip_process
-- makes aloca_motorista skip this driver, and the request is immediately
-- offered to the next suitable one. If nobody is in range it stays REQUESTED.
CREATE OR REPLACE PROCEDURE app_driver_reject (
   p_request_id IN NUMBER,
   p_driver_id  IN NUMBER,
   p_radius     IN NUMBER DEFAULT 50
) IS
   e_no_driver EXCEPTION;
   PRAGMA EXCEPTION_INIT(e_no_driver, -20810);
BEGIN
   UPDATE trip_request
      SET driver_id  = NULL,
          vehicle_id = NULL,
          status     = 'REQUESTED'
    WHERE request_id = p_request_id
      AND driver_id  = p_driver_id
      AND status     = 'ASSIGNED';

   IF SQL%ROWCOUNT = 0 THEN
      raise_application_error(-20822,
         'Pedido ' || p_request_id || ' nao esta atribuido ao motorista ' || p_driver_id);
   END IF;

   INSERT INTO trip_process (process_id, request_id, driver_id, status,
                             notification_date, change_date)
   VALUES (seq_trip_process.NEXTVAL, p_request_id, p_driver_id, 'REJECTED',
           SYSDATE, SYSDATE);

   BEGIN
      aloca_motorista(p_request_id, p_radius);
   EXCEPTION
      WHEN e_no_driver THEN
         NULL; -- nobody else in range: the request waits as REQUESTED
   END;
END app_driver_reject;
/
SHOW ERRORS

PROMPT === TVDEPT driver procedures created ===

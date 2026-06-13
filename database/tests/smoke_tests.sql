-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- CHECKPOINT 3 - DEMONSTRATION / TEST SCRIPT
-- ----------------------------------------------------------------------------
-- Exercises every CP3 object (happy path + exceptions). Every test that
-- changes data ends with ROLLBACK, so running this script leaves the database
-- exactly as it was. Run AFTER cp3_run_all.sql.
--     SQL> @cp3_test.sql
-- ============================================================================

SET SERVEROUTPUT ON SIZE UNLIMITED
SET LINESIZE 170
SET FEEDBACK OFF
WHENEVER SQLERROR CONTINUE

PROMPT
PROMPT =======================================================
PROMPT  1) FUNCTIONS
PROMPT =======================================================
DECLARE
   v_n NUMBER;
BEGIN
   v_n := distancia_linear(40.2030, -8.4100, 40.1867, -8.4155);
   dbms_output.put_line('distancia_linear .......... ' || v_n || ' km');
   v_n := motorista_mais_proximo(40.1867, -8.4155, 50);
   dbms_output.put_line('motorista_mais_proximo .... driver ' || v_n);
   v_n := valor_medio_diario(1, DATE '2023-01-01', DATE '2026-12-31');
   dbms_output.put_line('valor_medio_diario ........ ' || v_n || ' EUR');
   v_n := distancia_entre(1, 1);
   dbms_output.put_line('distancia_entre ........... ' || v_n || ' km');
   v_n := distancia_das_viagens(1);
   dbms_output.put_line('distancia_das_viagens ..... ' || v_n || ' km');
END;
/

PROMPT (function exceptions)
DECLARE
   v       NUMBER;
   v_d     DATE;
   v_plate VARCHAR2(20);
BEGIN
   BEGIN v := motorista_mais_proximo(0, 0, 1); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('no driver in range -> ' || SQLERRM); END;
   BEGIN v := valor_medio_diario(99999, SYSDATE-10, SYSDATE); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('vmd bad driver ---> ' || SQLERRM); END;
   BEGIN v := valor_medio_diario(1, SYSDATE, SYSDATE-10); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('vmd bad period ---> ' || SQLERRM); END;
   BEGIN v := distancia_entre(99999, 1); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('dist bad driver --> ' || SQLERRM); END;
   BEGIN v := distancia_entre(1, 99999); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('dist bad client --> ' || SQLERRM); END;
   BEGIN v_d := data_ultima_viagem('NO-PLATE', 'X'); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('duv bad plate ----> ' || SQLERRM); END;
   SELECT plate INTO v_plate FROM vehicle WHERE ROWNUM = 1;
   BEGIN v_d := data_ultima_viagem(v_plate, '___none___'); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('duv bad client ---> ' || SQLERRM); END;
END;
/

PROMPT
PROMPT =======================================================
PROMPT  2) PROCEDURE aloca_motorista  (+ update_pedido trigger)
PROMPT =======================================================
DECLARE
   v_drv NUMBER; v_st VARCHAR2(20); v_log NUMBER;
BEGIN
   INSERT INTO trip_request (request_id, client_id, request_date, status, vehicle_type)
   VALUES (90001, 1, SYSDATE, 'REQUESTED', 'NOAI');
   aloca_motorista(90001, 100);
   SELECT driver_id, status INTO v_drv, v_st FROM trip_request WHERE request_id = 90001;
   SELECT COUNT(*) INTO v_log FROM trip_process WHERE request_id = 90001;
   dbms_output.put_line('allocated driver=' || v_drv || ' status=' || v_st || ' | history rows logged=' || v_log);
   BEGIN aloca_motorista(99999, 100); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('bad request -> ' || SQLERRM); END;
END;
/
ROLLBACK;

PROMPT
PROMPT =======================================================
PROMPT  3) TRIGGER update_status  (detach / block offline)
PROMPT =======================================================
DECLARE v_drv NUMBER; v_st VARCHAR2(20);
BEGIN
   INSERT INTO trip_request (request_id, client_id, request_date, status, driver_id, vehicle_type)
   VALUES (90002, 1, SYSDATE, 'ASSIGNED', 2, 'NOAI');
   UPDATE driver SET status = 'AVAILABLE' WHERE driver_id = 2;
   UPDATE driver SET status = 'OFFLINE' WHERE driver_id = 2;            -- detaches request
   SELECT NVL(driver_id,-1), status INTO v_drv, v_st FROM trip_request WHERE request_id = 90002;
   dbms_output.put_line('after OFFLINE: request driver=' || v_drv || ' status=' || v_st || ' (expect -1 / REQUESTED)');
   UPDATE driver SET status = 'AVAILABLE' WHERE driver_id = 3;
   -- progress through valid states (the lifecycle guard forbids shortcuts)
   UPDATE trip_request SET driver_id = 3, status = 'ASSIGNED' WHERE request_id = 90002;
   UPDATE trip_request SET status = 'ACCEPTED'  WHERE request_id = 90002;
   UPDATE trip_request SET status = 'PICKED_UP' WHERE request_id = 90002;
   BEGIN
      UPDATE driver SET status = 'OFFLINE' WHERE driver_id = 3;          -- must be blocked
      dbms_output.put_line('ERROR: offline during trip was allowed');
   EXCEPTION WHEN OTHERS THEN dbms_output.put_line('block offline mid-trip -> ' || SQLERRM); END;
END;
/
ROLLBACK;

PROMPT
PROMPT =======================================================
PROMPT  4) TRIGGER cliente_Avalia  (validate + client counters)
PROMPT =======================================================
DECLARE v_trip NUMBER; v_client NUMBER; v_drv NUMBER; v_before NUMBER; v_after NUMBER;
BEGIN
   SELECT t.request_id, tr.client_id INTO v_trip, v_client
     FROM trip t JOIN trip_request tr ON tr.request_id = t.request_id
    WHERE t.status = 'COMPLETED' AND ROWNUM = 1;
   SELECT num_evaluations INTO v_before FROM client WHERE client_id = v_client;
   INSERT INTO client_rating (client_rating_id, trip_id, client_id, score) VALUES (90003, v_trip, v_client, 5);
   SELECT num_evaluations INTO v_after FROM client WHERE client_id = v_client;
   dbms_output.put_line('client ' || v_client || ' evaluations ' || v_before || ' -> ' || v_after);
END;
/
ROLLBACK;

PROMPT
PROMPT =======================================================
PROMPT  5) TRIGGER viagem_Terminada  (free driver + shift totals)
PROMPT =======================================================
DECLARE
   v_end DATE := DATE '2026-05-25'; v_day NUMBER;
   v_tc NUMBER; v_val NUMBER; v_dur NUMBER; v_dstatus VARCHAR2(20);
BEGIN
   v_day := TO_NUMBER(TO_CHAR(v_end, 'D'));
   DELETE FROM driver_schedule WHERE driver_id = 1 AND vehicle_id = 1 AND day_of_week = v_day;
   INSERT INTO driver_schedule (driver_id, vehicle_id, day_of_week, start_time, end_time, trips_count, total_duration_min, total_value)
   VALUES (1, 1, v_day, v_end - 1, v_end + 1, 0, 0, 0);
   INSERT INTO trip_request (request_id, client_id, request_date, status, vehicle_type) VALUES (90005, 1, v_end, 'COMPLETED', 'NOAI');
   INSERT INTO trip (request_id, driver_id, vehicle_id, start_date, end_date, distance_km, value, status)
   VALUES (90005, 1, 1, v_end - 1/24, v_end, 5, 12.5, 'IN_PROGRESS');
   UPDATE driver SET status = 'ON_TRIP' WHERE driver_id = 1;
   UPDATE trip SET status = 'COMPLETED' WHERE request_id = 90005;        -- fires trigger
   SELECT trips_count, total_value, total_duration_min INTO v_tc, v_val, v_dur
     FROM driver_schedule WHERE driver_id = 1 AND vehicle_id = 1 AND day_of_week = v_day;
   SELECT status INTO v_dstatus FROM driver WHERE driver_id = 1;
   dbms_output.put_line('shift trips=' || v_tc || ' value=' || v_val || ' dur_min=' || v_dur || ' | driver1 status=' || v_dstatus);
END;
/
ROLLBACK;

PROMPT
PROMPT =======================================================
PROMPT  6) PROCEDURES paga_aos_motoristas / cancela_motoristas
PROMPT =======================================================
DECLARE v_before NUMBER; v_after NUMBER;
BEGIN
   SELECT COUNT(*) INTO v_before FROM driver_payment;
   paga_aos_motoristas(0, 0);
   SELECT COUNT(*) INTO v_after FROM driver_payment;
   dbms_output.put_line('paga_aos_motoristas: driver_payment ' || v_before || ' -> ' || v_after);
   BEGIN paga_aos_motoristas(-5, 0); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('bad amount   -> ' || SQLERRM); END;
   BEGIN paga_aos_motoristas(0, -5); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('bad interval -> ' || SQLERRM); END;
END;
/
ROLLBACK;
DECLARE v_before NUMBER; v_after NUMBER;
BEGIN
   SELECT COUNT(*) INTO v_before FROM driver WHERE status = 'DISABLED';
   cancela_motoristas('NOAI', DATE '2024-01-01', DATE '2026-12-31');
   SELECT COUNT(*) INTO v_after FROM driver WHERE status = 'DISABLED';
   dbms_output.put_line('cancela_motoristas: disabled ' || v_before || ' -> ' || v_after);
   BEGIN cancela_motoristas('NOAI', SYSDATE, SYSDATE-10); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('bad interval -> ' || SQLERRM); END;
   BEGIN cancela_motoristas('ZZZ', DATE '2024-01-01', DATE '2026-12-31'); EXCEPTION WHEN OTHERS THEN dbms_output.put_line('bad vtype    -> ' || SQLERRM); END;
END;
/
ROLLBACK;

PROMPT
PROMPT =======================================================
PROMPT  7) INDIVIDUAL OBJECTS  (  /  )
PROMPT =======================================================
DECLARE v NUMBER; v_b NUMBER; v_a NUMBER; v_trip NUMBER; v_drv NUMBER; v_cli NUMBER; v_st VARCHAR2(20); v_fee NUMBER;
BEGIN
   --  N_FUNC: net monthly earnings
   v := FN_DRIVER_MONTHLY_NET(1, 12, 2025);
   dbms_output.put_line('FN_DRIVER_MONTHLY_NET(d1,12,2025) net = ' || v || ' EUR');
   --  O_PROC: single-driver payment
   SELECT COUNT(*) INTO v_b FROM driver_payment;
   SP_REGISTER_DRIVER_PAYMENT(1, DATE '2025-01-01', DATE '2026-12-31');
   SELECT COUNT(*) INTO v_a FROM driver_payment;
   dbms_output.put_line('SP_REGISTER_DRIVER_PAYMENT: payments ' || v_b || ' -> ' || v_a);
   ROLLBACK;
   --  P_TRIG: driver received-rating update
   SELECT t.request_id, t.driver_id, tr.client_id INTO v_trip, v_drv, v_cli
     FROM trip t JOIN trip_request tr ON tr.request_id = t.request_id
    WHERE t.status = 'COMPLETED' AND t.driver_id IS NOT NULL AND ROWNUM = 1;
   SELECT num_ratings INTO v_b FROM driver WHERE driver_id = v_drv;
   INSERT INTO client_rating (client_rating_id, trip_id, client_id, score) VALUES (91001, v_trip, v_cli, 5);
   SELECT num_ratings INTO v_a FROM driver WHERE driver_id = v_drv;
   dbms_output.put_line('TRG_DRIVER_RATING_UPDATE: driver ' || v_drv || ' num_ratings ' || v_b || ' -> ' || v_a);
   ROLLBACK;
   --  N_FUNC: estimated request distance
   INSERT INTO trip_request (request_id, client_id, request_date, status, vehicle_type, dest_lat, dest_long)
   VALUES (90011, 1, SYSDATE, 'REQUESTED', 'NOAI', 40.1500, -8.5000);
   v := FN_REQUEST_DISTANCE(90011);
   dbms_output.put_line('FN_REQUEST_DISTANCE(req): estimated distance = ' || v || ' km');
   ROLLBACK;
   --  O_PROC: cancel request (+ update_pedido)
   INSERT INTO trip_request (request_id, client_id, request_date, status, vehicle_type, fuel_type)
   VALUES (90012, 1, SYSDATE, 'REQUESTED', 'NOAI', 'Electric');
   SP_CANCEL_REQUEST(90012);
   SELECT status, proposed_value INTO v_st, v_fee FROM trip_request WHERE request_id = 90012;
   dbms_output.put_line('SP_CANCEL_REQUEST: status=' || v_st || ' fee=' || v_fee);
   ROLLBACK;
END;
/

PROMPT ( P_TRIG lifecycle guard)
DECLARE v_req NUMBER;
BEGIN
   SELECT request_id INTO v_req FROM trip_request WHERE status = 'COMPLETED' AND ROWNUM = 1;
   BEGIN UPDATE trip_request SET status = 'ASSIGNED' WHERE request_id = v_req;
   EXCEPTION WHEN OTHERS THEN dbms_output.put_line('terminal->other blocked -> ' || SQLERRM); END;
   ROLLBACK;
END;
/

PROMPT
PROMPT =======================================================
PROMPT  8) INTEGRITY (item q)
PROMPT =======================================================
DECLARE
BEGIN
   BEGIN
      INSERT INTO trip_request (request_id, client_id, request_date, status, vehicle_type) VALUES (95001, 1, SYSDATE, 'REQUESTED', 'NOAI');
      INSERT INTO trip (request_id, driver_id, vehicle_id, start_date, end_date, distance_km, value, status) VALUES (95001, 1, 1, SYSDATE, SYSDATE-1, 5, 10, 'COMPLETED');
      dbms_output.put_line('ERROR: end<start accepted');
   EXCEPTION WHEN OTHERS THEN dbms_output.put_line('end<start  -> ' || SQLERRM); END;
   ROLLBACK;
   BEGIN
      INSERT INTO client (client_id, name, email, birth_date) VALUES (95003, 'Future', 'fp@x.pt', SYSDATE+30);
      dbms_output.put_line('ERROR: future birth accepted');
   EXCEPTION WHEN OTHERS THEN dbms_output.put_line('future birth -> ' || SQLERRM); END;
   ROLLBACK;
   BEGIN
      INSERT INTO driver_payment (payment_id, driver_id, period_start, period_end, value, commission, net_value) VALUES (95004, 1, SYSDATE-10, SYSDATE, 100, 15, 50);
      dbms_output.put_line('ERROR: inconsistent net accepted');
   EXCEPTION WHEN OTHERS THEN dbms_output.put_line('net<>gross-comm -> ' || SQLERRM); END;
   ROLLBACK;
END;
/

PROMPT
PROMPT === CP3 demonstration finished (database left unchanged) ===

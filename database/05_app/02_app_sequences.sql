-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- APPLICATION LAYER - sequences for rows created at runtime by the API
-- ----------------------------------------------------------------------------
-- The seed data uses explicit ids; the running application needs sequences to
-- generate new primary keys for trip requests and ratings.
-- Started above the seeded id ranges to avoid collisions.
-- ============================================================================

SET DEFINE OFF

DECLARE
   PROCEDURE drop_seq (p_name VARCHAR2) IS
   BEGIN
      EXECUTE IMMEDIATE 'DROP SEQUENCE ' || p_name;
   EXCEPTION
      WHEN OTHERS THEN
         IF sqlcode != -2289 THEN RAISE; END IF; -- ORA-02289: does not exist
   END;
BEGIN
   drop_seq('seq_trip_request');
   drop_seq('seq_client_rating');
END;
/

CREATE SEQUENCE seq_trip_request  START WITH 100000 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seq_client_rating START WITH 100000 INCREMENT BY 1 NOCACHE NOCYCLE;

PROMPT === TVDEPT app sequences created ===

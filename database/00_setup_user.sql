-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- Creates the application schema/user. Run this once as a DBA, then run
-- install.sql connected as the TVDEPT user.
-- ============================================================================

-- Allows creating a simple local user on Oracle XE (CDB root).
ALTER SESSION SET "_ORACLE_SCRIPT" = true;

BEGIN
   EXECUTE IMMEDIATE 'DROP USER tvdept CASCADE';
EXCEPTION
   WHEN OTHERS THEN
      NULL; -- user does not exist yet
END;
/

CREATE USER tvdept IDENTIFIED BY tvdept;
GRANT CONNECT, RESOURCE TO tvdept;
GRANT UNLIMITED TABLESPACE TO tvdept;

-- NOTE: change the password before any non-local use.

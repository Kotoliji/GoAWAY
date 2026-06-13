-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- MASTER INSTALL SCRIPT
-- ----------------------------------------------------------------------------
-- Builds the whole database from scratch, in order. Run it connected as the
-- TVDEPT application user (see 00_setup_user.sql):
--
--     sqlplus tvdept/tvdept @install.sql
--
-- WARNING: 01_schema/tables.sql drops and recreates all tables, so running
-- install.sql wipes existing data and rebuilds a clean instance.
-- @@ paths are resolved relative to this script's folder.
-- ============================================================================

SET ECHO OFF
SET FEEDBACK ON
SET SERVEROUTPUT ON SIZE UNLIMITED
WHENEVER SQLERROR CONTINUE

PROMPT ====================================================
PROMPT  TVDEPT - building schema, data, views and PL/SQL
PROMPT ====================================================

PROMPT --- 1. Schema (tables + constraints) ---
@@01_schema/tables.sql

PROMPT --- 2. Sample data ---
@@02_data/insert_data.sql
COMMIT;

PROMPT --- 3. Views ---
@@03_views/views.sql

PROMPT --- 4. PL/SQL layer ---
@@04_plsql/00_schema_changes.sql
@@04_plsql/01_functions.sql
@@04_plsql/02_procedures.sql
@@04_plsql/03_triggers.sql
@@04_plsql/04_extra_objects.sql
@@04_plsql/05_integrity.sql
@@04_plsql/06_physical_params.sql

PROMPT --- 5. Application layer (auth, devices, runtime sequences) ---
@@05_app/01_auth_tables.sql
@@05_app/02_app_sequences.sql

PROMPT ====================================================
PROMPT  Verification: invalid objects (should be none)
PROMPT ====================================================
SET LINES 160 PAGES 200
COLUMN object_name FORMAT a30
SELECT object_type, object_name, status
  FROM user_objects
 WHERE status = 'INVALID'
 ORDER BY object_type, object_name;

PROMPT === TVDEPT install finished ===

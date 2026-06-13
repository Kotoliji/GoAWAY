-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- CHECKPOINT 3 - item r) PHYSICAL PARAMETERS OF THE 5 LARGEST TABLES
-- ============================================================================
-- The 5 tables that will grow the most (by total space) in a real TVDE
-- operation are the ones tied to runtime telemetry and the trip life-cycle.
-- They are chosen by projected TOTAL space = projected rows x row length,
-- NOT by the tiny sample currently loaded.
--
-- ----------------------------------------------------------------------------
-- ASSUMPTIONS (stated so the numbers can be checked)
-- ----------------------------------------------------------------------------
--   * Fleet ............... 200 active vehicles
--   * GPS ping ............ 1 per minute per vehicle, ~12 h online/day
--                           => 200 * 60 * 12 * 365 ~= 52,560,000 rows/year
--   * Trips ............... ~1,100,000 completed trips / year
--   * Trip requests ....... ~1,300,000 / year (trips + cancellations)
--   * Status changes ...... ~5 per request => ~6,500,000 trip_process / year
--   * Ratings ............. ~70% of trips rated => ~770,000 client_rating/year
--   * Horizon ............. 1 year of operation
--
-- ----------------------------------------------------------------------------
-- METHOD (Oracle block sizing)
-- ----------------------------------------------------------------------------
--   db_block_size .................. 8192 bytes  (verified on this instance)
--   fixed block overhead ........... ~100 bytes  (block header + ITL)
--   per-row overhead ............... 5 bytes      (3 row header + 2 directory)
--   avg_row_len .................... measured with DBMS_STATS on real data
--   usable/block = (8192 - 100) * (1 - PCTFREE/100)
--   rows/block   = floor( usable/block / (avg_row_len + 5) )
--   blocks       = ceil( projected_rows / rows/block )
--   size         = blocks * 8192
--
-- PCTFREE is chosen per table by how much rows are UPDATED after insert:
--   insert-only tables (telemetry/history/ratings) -> PCTFREE 5
--   tables updated through the life-cycle (trip, trip_request) -> PCTFREE 15
-- INITRANS is raised on tables with many concurrent inserters.
--
-- ----------------------------------------------------------------------------
-- RESULTS (1-year projection)
-- ----------------------------------------------------------------------------
-- TABLE          AVG_ROW  EFF  PCTFREE ROWS/BLK   ROWS/YEAR   BLOCKS    SIZE
-- -------------- -------  ---  ------- --------  ----------  -------  --------
-- LOCATION          34     39     5      197     52,560,000  266,802  ~2.04 GiB
-- TRIP_PROCESS      31     36     5      213      6,500,000   30,517  ~238 MiB
-- TRIP_REQUEST     105    110    15       62      1,300,000   20,968  ~164 MiB
-- TRIP              61     66    15      104      1,100,000   10,577  ~ 83 MiB
-- CLIENT_RATING     33     38     5      202        770,000    3,812  ~ 30 MiB
--                                                            -------  --------
--                                              TOTAL ~ 2.65 GB / year
--
-- LOCATION alone is ~80% of the volume, so it is the table whose physical
-- design matters most (see recommendations at the bottom).
-- ============================================================================

SET DEFINE OFF

-- ----------------------------------------------------------------------------
-- Apply the storage attributes that CAN be changed on the existing tables.
-- (PCTFREE and INITRANS are segment attributes and are modifiable in place;
--  INITIAL/NEXT cannot be changed after creation -- see the CREATE TABLE
--  recommendations further down for a fresh deployment.)
-- ----------------------------------------------------------------------------
-- location: many vehicles inserting at once -> low PCTFREE, high INITRANS
ALTER TABLE location PCTFREE 5 INITRANS 8;
-- trip_process: high-rate history inserts
ALTER TABLE trip_process PCTFREE 5 INITRANS 4;
-- trip_request: updated along the life-cycle -> reserve free space
ALTER TABLE trip_request PCTFREE 15 INITRANS 3;
-- trip: end_date/value/status filled in after insert -> reserve free space
ALTER TABLE trip PCTFREE 15 INITRANS 3;
-- client_rating: insert-only
ALTER TABLE client_rating PCTFREE 5 INITRANS 2;

PROMPT === CP3 physical parameters (PCTFREE/INITRANS) applied ===

-- ----------------------------------------------------------------------------
-- RECOMMENDED STORAGE for a production (re)creation of these segments.
-- Kept as comments because they belong in the CREATE TABLE of a new deployment
-- (and because the tablespaces below would have to exist first).
-- ----------------------------------------------------------------------------
--
-- -- Dedicated tablespace for the huge telemetry table, RANGE-partitioned by
-- -- month so old partitions can be archived/dropped cheaply:
-- CREATE TABLESPACE ts_location DATAFILE 'ts_location01.dbf'
--    SIZE 256M AUTOEXTEND ON NEXT 256M MAXSIZE 8G
--    EXTENT MANAGEMENT LOCAL AUTOALLOCATE SEGMENT SPACE MANAGEMENT AUTO;
--
-- CREATE TABLE location ( ... )
--    PCTFREE 5 INITRANS 8 TABLESPACE ts_location
--    STORAGE ( INITIAL 64M NEXT 64M MAXEXTENTS UNLIMITED PCTINCREASE 0 )
--    PARTITION BY RANGE (location_date) INTERVAL (NUMTOYMINTERVAL(1,'MONTH'))
--    ( PARTITION p_start VALUES LESS THAN (TO_DATE('2026-01-01','YYYY-MM-DD')) );
--
-- -- trip_process (history): INITIAL 8M  NEXT 8M  PCTFREE 5  INITRANS 4
-- -- trip_request         : INITIAL 8M  NEXT 8M  PCTFREE 15 INITRANS 3
-- -- trip                 : INITIAL 4M  NEXT 4M  PCTFREE 15 INITRANS 3
-- -- client_rating        : INITIAL 4M  NEXT 4M  PCTFREE 5  INITRANS 2
-- ----------------------------------------------------------------------------

-- Reference: show the current real segment sizes on this instance
column segment_name format a16
SELECT segment_name,
       blocks,
       bytes / 1024 AS kbytes,
       extents
  FROM user_segments
 WHERE segment_name IN ( 'LOCATION', 'TRIP_PROCESS', 'TRIP_REQUEST', 'TRIP', 'CLIENT_RATING' )
 ORDER BY bytes DESC;

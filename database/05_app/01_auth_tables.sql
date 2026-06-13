-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- APPLICATION LAYER - authentication & devices
-- ----------------------------------------------------------------------------
-- Identity tables the mobile/web app needs on top of the business schema:
--   * APP_USER       - login identity, role, link to a client or driver row
--   * REFRESH_TOKEN  - rotating refresh tokens for JWT sessions
--   * DEVICE         - push-notification (FCM) tokens per user
-- Re-runnable: drops existing objects first (ignoring "does not exist").
-- Depends on: 01_schema/tables.sql (FKs to CLIENT and DRIVER).
-- ============================================================================

SET DEFINE OFF

-- ----------------------------------------------------------------------------
-- Drop (child tables first), ignore ORA-00942 (table does not exist)
-- ----------------------------------------------------------------------------
DECLARE
   PROCEDURE drop_obj (p_sql VARCHAR2, p_ignore NUMBER) IS
   BEGIN
      EXECUTE IMMEDIATE p_sql;
   EXCEPTION
      WHEN OTHERS THEN
         IF sqlcode != p_ignore THEN RAISE; END IF;
   END;
BEGIN
   drop_obj('DROP TABLE device CASCADE CONSTRAINTS', -942);
   drop_obj('DROP TABLE refresh_token CASCADE CONSTRAINTS', -942);
   drop_obj('DROP TABLE app_user CASCADE CONSTRAINTS', -942);
   drop_obj('DROP SEQUENCE seq_app_user', -2289);      -- ORA-02289: sequence does not exist
   drop_obj('DROP SEQUENCE seq_refresh_token', -2289);
   drop_obj('DROP SEQUENCE seq_device', -2289);
END;
/

CREATE SEQUENCE seq_app_user      START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seq_refresh_token START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;
CREATE SEQUENCE seq_device        START WITH 1 INCREMENT BY 1 NOCACHE NOCYCLE;

-- ----------------------------------------------------------------------------
-- APP_USER: one login per person. A CLIENT login links a CLIENT row, a DRIVER
-- login links a DRIVER row, an ADMIN links neither.
-- ----------------------------------------------------------------------------
CREATE TABLE app_user (
   user_id       NUMBER
      CONSTRAINT pk_app_user PRIMARY KEY,
   email         VARCHAR2(100) NOT NULL
      CONSTRAINT uq_app_user_email UNIQUE,
   password_hash VARCHAR2(200) NOT NULL,              -- bcrypt/argon2 hash, never plaintext
   role          VARCHAR2(10) NOT NULL
      CONSTRAINT ck_app_user_role CHECK ( role IN ( 'CLIENT', 'DRIVER', 'ADMIN' ) ),
   client_id     NUMBER,
   driver_id     NUMBER,
   status        VARCHAR2(20) DEFAULT 'ACTIVE'
      CONSTRAINT ck_app_user_status CHECK ( status IN ( 'ACTIVE', 'BLOCKED' ) ),
   created_at    DATE DEFAULT SYSDATE,
   CONSTRAINT fk_app_user_client FOREIGN KEY ( client_id ) REFERENCES client ( client_id ),
   CONSTRAINT fk_app_user_driver FOREIGN KEY ( driver_id ) REFERENCES driver ( driver_id ),
   -- role and the linked row must be consistent
   CONSTRAINT ck_app_user_link CHECK (
      ( role = 'CLIENT' AND client_id IS NOT NULL AND driver_id IS NULL )
      OR ( role = 'DRIVER' AND driver_id IS NOT NULL AND client_id IS NULL )
      OR ( role = 'ADMIN'  AND client_id IS NULL AND driver_id IS NULL )
   )
);

-- ----------------------------------------------------------------------------
-- REFRESH_TOKEN: rotating refresh tokens (store only a hash of the token).
-- ----------------------------------------------------------------------------
CREATE TABLE refresh_token (
   token_id   NUMBER
      CONSTRAINT pk_refresh_token PRIMARY KEY,
   user_id    NUMBER NOT NULL,
   token_hash VARCHAR2(200) NOT NULL,
   expires_at DATE NOT NULL,
   revoked    NUMBER(1) DEFAULT 0
      CONSTRAINT ck_refresh_revoked CHECK ( revoked IN ( 0, 1 ) ),
   created_at DATE DEFAULT SYSDATE,
   CONSTRAINT fk_refresh_user FOREIGN KEY ( user_id ) REFERENCES app_user ( user_id )
);

-- ----------------------------------------------------------------------------
-- DEVICE: push (FCM) token per user/device.
-- ----------------------------------------------------------------------------
CREATE TABLE device (
   device_id  NUMBER
      CONSTRAINT pk_device PRIMARY KEY,
   user_id    NUMBER NOT NULL,
   fcm_token  VARCHAR2(255) NOT NULL
      CONSTRAINT uq_device_token UNIQUE,
   platform   VARCHAR2(10)
      CONSTRAINT ck_device_platform CHECK ( platform IN ( 'IOS', 'ANDROID' ) ),
   created_at DATE DEFAULT SYSDATE,
   CONSTRAINT fk_device_user FOREIGN KEY ( user_id ) REFERENCES app_user ( user_id )
);

-- Helpful indexes for the API's hot paths
CREATE INDEX ix_refresh_user ON refresh_token ( user_id );
CREATE INDEX ix_device_user  ON device ( user_id );

PROMPT === TVDEPT app auth tables created ===

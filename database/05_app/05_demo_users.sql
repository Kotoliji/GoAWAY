-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- APPLICATION LAYER - demo logins
-- ----------------------------------------------------------------------------
-- Gives every seeded client and driver a login (their seed email) plus one
-- admin, so the app and the admin panel can be tried right after install.
-- Password for all of them: demo123 (bcrypt hash below). LOCAL DEMO ONLY.
-- Depends on: 02_data/insert_data.sql, 05_app/01_auth_tables.sql.
-- ============================================================================

SET DEFINE OFF

INSERT INTO app_user (user_id, email, password_hash, role)
VALUES (seq_app_user.NEXTVAL, 'admin@tvdept.pt',
        '$2a$10$0RK1QBmz15JZ469RIUDAeuLtO3D12wce7dSS3hOzZBBe8bRB8DAFC', 'ADMIN');

INSERT INTO app_user (user_id, email, password_hash, role, client_id)
SELECT seq_app_user.NEXTVAL, email,
       '$2a$10$0RK1QBmz15JZ469RIUDAeuLtO3D12wce7dSS3hOzZBBe8bRB8DAFC', 'CLIENT', client_id
  FROM client;

INSERT INTO app_user (user_id, email, password_hash, role, driver_id)
SELECT seq_app_user.NEXTVAL, email,
       '$2a$10$0RK1QBmz15JZ469RIUDAeuLtO3D12wce7dSS3hOzZBBe8bRB8DAFC', 'DRIVER', driver_id
  FROM driver;

COMMIT;

PROMPT === TVDEPT demo logins created (password: demo123) ===

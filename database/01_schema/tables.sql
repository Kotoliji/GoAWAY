-- ============================================
-- AABD 2025/2026 - Trabalho Pratico
-- TVDEPT
-- Script de criacao da base de dados
-- ============================================

-- Drop tables (ordem inversa por causa das FK)
drop table trip_process cascade constraints;
drop table trip_preferences cascade constraints;
drop table driver_payment cascade constraints;
drop table driver_rating cascade constraints;
drop table client_rating cascade constraints;
drop table trip cascade constraints;
drop table trip_request cascade constraints;
drop table location cascade constraints;
drop table driver_schedule cascade constraints;
drop table driver_vehicle cascade constraints;
drop table tariff cascade constraints;
drop table vehicle cascade constraints;
drop table driver cascade constraints;
drop table client cascade constraints;

-- ============================================
-- 1. CLIENT
-- ============================================
create table client (
   client_id       number
      constraint pk_client primary key,
   name            varchar2(100) not null,
   email           varchar2(100) not null
      constraint uq_client_email unique,
   phone           varchar2(20),
   birth_date      date,
   gender          varchar2(10)
      constraint ck_client_gender check ( gender in ( 'M',
                                                      'F',
                                                      'OTHER' ) ),
   address         varchar2(200),
   latitude        number,
   longitude       number,
   payment_method  varchar2(20)
      constraint ck_client_payment check ( payment_method in ( 'MULTIBANCO',
                                                               'MBWAY' ) ),
   num_evaluations number default 0,
   avg_score       number
);

-- ============================================
-- 2. DRIVER
-- ============================================
create table driver (
   driver_id         number
      constraint pk_driver primary key,
   name              varchar2(100) not null,
   email             varchar2(100) not null
      constraint uq_driver_email unique,
   phone             varchar2(20),
   birth_date        date,
   license_number    varchar2(30),
   latitude          number,
   longitude         number,
   registration_date date default sysdate,
   status            varchar2(20) default 'OFFLINE'
      constraint ck_driver_status check ( status in ( 'OFFLINE',
                                                      'AVAILABLE',
                                                      'ON_TRIP' ) ),
   avg_score         number,
   num_ratings       number default 0
);

-- ============================================
-- 3. VEHICLE
-- ============================================
create table vehicle (
   vehicle_id   number
      constraint pk_vehicle primary key,
   plate        varchar2(20) not null
      constraint uq_vehicle_plate unique,
   brand        varchar2(50),
   model        varchar2(50),
   year         number,
   fuel_type    varchar2(30),
   vehicle_type varchar2(10)
      constraint ck_vehicle_type check ( vehicle_type in ( 'AI',
                                                           'NOAI' ) )
);

-- ============================================
-- 4. DRIVER_VEHICLE (N:N between DRIVER and VEHICLE)
-- ============================================
create table driver_vehicle (
   driver_id  number not null,
   vehicle_id number not null,
   ownership  varchar2(20) not null
      constraint ck_dv_ownership check ( ownership in ( 'OWNER',
                                                        'COMPANY',
                                                        'SHARED' ) ),
   constraint pk_driver_vehicle primary key ( driver_id,
                                              vehicle_id ),
    -- One vehicle can only belong to one driver (1:N relationship)
   constraint uq_dv_vehicle unique ( vehicle_id ),
   constraint fk_dv_driver foreign key ( driver_id )
      references driver ( driver_id ),
   constraint fk_dv_vehicle foreign key ( vehicle_id )
      references vehicle ( vehicle_id )
);

-- ============================================
-- 5. TARIFF
-- ============================================
create table tariff (
   tariff_id        number
      constraint pk_tariff primary key,
   fuel_type        varchar2(30) not null,
   price_per_km     number not null,
   price_per_minute number not null,
   base_fee         number not null,
   cancellation_fee number not null,
   commission_pct   number not null
);

-- ============================================
-- 6. DRIVER_SCHEDULE
-- ============================================
create table driver_schedule (
   driver_id   number not null,
   vehicle_id  number not null,
   day_of_week number not null
      constraint ck_schedule_day check ( day_of_week between 1 and 7 ),
   start_time  date not null,
   end_time    date not null,
   constraint pk_driver_schedule primary key ( driver_id,
                                               vehicle_id,
                                               day_of_week ),
   constraint fk_schedule_driver foreign key ( driver_id )
      references driver ( driver_id ),
   constraint fk_schedule_vehicle foreign key ( vehicle_id )
      references vehicle ( vehicle_id )
);

-- ============================================
-- 7. LOCATION
-- ============================================
create table location (
   location_id   number
      constraint pk_location primary key,
   vehicle_id    number not null,
   latitude      number not null,
   longitude     number not null,
   location_date date default sysdate,
   status        varchar2(20)
      constraint ck_location_status check ( status in ( 'OFFLINE',
                                                        'AVAILABLE',
                                                        'ON_TRIP',
                                                        'CRUSHED' ) ),
   constraint fk_location_vehicle foreign key ( vehicle_id )
      references vehicle ( vehicle_id )
);

-- ============================================
-- 8. TRIP_REQUEST
-- ============================================
create table trip_request (
   request_id        number
      constraint pk_trip_request primary key,
   client_id         number not null,
   driver_id         number,
   origin_address    varchar2(200),
   dest_name         varchar2(200),
   dest_lat          number,
   dest_long         number,
   request_date      date default sysdate,
   pickup_date       date,
   fuel_type         varchar2(30),
   status            varchar2(20) default 'REQUESTED'
      constraint ck_request_status check ( status in ( 'REQUESTED',
                                                       'ASSIGNED',
                                                       'ACCEPTED',
                                                       'PICKED_UP',
                                                       'CANCELLED',
                                                       'COMPLETED' ) ),
   proposed_value    number,
   cancellation_date date,
   vehicle_id        number,
   vehicle_type      varchar2(10)
      constraint ck_request_vehicle_type check ( vehicle_type in ( 'AI',
                                                                   'NOAI' ) ),
   constraint fk_request_client foreign key ( client_id )
      references client ( client_id ),
   constraint fk_request_driver foreign key ( driver_id )
      references driver ( driver_id ),
   constraint fk_request_vehicle foreign key ( vehicle_id )
      references vehicle ( vehicle_id )
);

-- ============================================
-- 9. TRIP_PREFERENCES
-- ============================================
create table trip_preferences (
   request_id      number
      constraint pk_trip_preferences primary key,
   vehicle_class   varchar2(30) not null
      constraint ck_pref_class check ( vehicle_class in ( 'STANDARD',
                                                          'PREMIUM',
                                                          'SMART' ) ),
   smart_vehicle   number(1) default 0
      constraint ck_pref_smart check ( smart_vehicle in ( 0,
                                                          1 ) ),
   preferred_model varchar2(50),
   extra_fee       number,
   constraint fk_pref_request foreign key ( request_id )
      references trip_request ( request_id ),
   constraint ck_pref_smart_model
      check ( smart_vehicle = 1
          or ( preferred_model is null
         and extra_fee is null ) )
);

-- ============================================
-- 10. TRIP
-- ============================================
create table trip (
   request_id  number
      constraint pk_trip primary key,
   driver_id   number,
   vehicle_id  number not null,
   start_date  date,
   pickup_date date,
   pickup_lat  number,
   pickup_long number,
   end_date    date,
   distance_km number,
   value       number,
   status      varchar2(20) default 'IN_PROGRESS'
      constraint ck_trip_status check ( status in ( 'IN_PROGRESS',
                                                    'COMPLETED' ) ),
   constraint fk_trip_request foreign key ( request_id )
      references trip_request ( request_id ),
   constraint fk_trip_driver foreign key ( driver_id )
      references driver ( driver_id ),
   constraint fk_trip_vehicle foreign key ( vehicle_id )
      references vehicle ( vehicle_id )
);

-- ============================================
-- 11. CLIENT_RATING
-- ============================================
create table client_rating (
   client_rating_id number
      constraint pk_client_rating primary key,
   trip_id          number not null,
   client_id        number not null,
   score            number not null
      constraint ck_client_rating_score check ( score between 1 and 5 ),
   review_comment   varchar2(500),
   rating_date      date default sysdate,
   constraint fk_crating_trip foreign key ( trip_id )
      references trip ( request_id ),
   constraint fk_crating_client foreign key ( client_id )
      references client ( client_id )
);

-- ============================================
-- 12. DRIVER_RATING
-- ============================================
create table driver_rating (
   driver_rating_id number
      constraint pk_driver_rating primary key,
   trip_id          number not null,
   driver_id        number not null,
   score            number not null
      constraint ck_driver_rating_score check ( score between 1 and 5 ),
   review_comment   varchar2(500),
   rating_date      date default sysdate,
   constraint fk_drating_trip foreign key ( trip_id )
      references trip ( request_id ),
   constraint fk_drating_driver foreign key ( driver_id )
      references driver ( driver_id )
);

-- ============================================
-- 13. DRIVER_PAYMENT
-- ============================================
create table driver_payment (
   payment_id   number
      constraint pk_driver_payment primary key,
   driver_id    number not null,
   period_start date not null,
   period_end   date not null,
   value        number not null,
   commission   number not null,
   net_value    number not null,
   payment_date date default sysdate,
   constraint fk_dpayment_driver foreign key ( driver_id )
      references driver ( driver_id )
);

-- ============================================
-- 14. TRIP_PROCESS
-- ============================================
create table trip_process (
   process_id        number
      constraint pk_trip_process primary key,
   request_id        number not null,
   driver_id         number,
   status            varchar2(20),
   proposed_value    number,
   notification_date date,
   change_date       date default sysdate,
   constraint fk_process_request foreign key ( request_id )
      references trip_request ( request_id ),
   constraint fk_process_driver foreign key ( driver_id )
      references driver ( driver_id )
);
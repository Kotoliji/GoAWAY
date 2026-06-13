# TVDEPT — Ride-Hailing Database (Oracle / PL-SQL)

A relational database for a **TVDE / Uber-like individual passenger-transport
platform**. It models drivers, vehicles, clients, trip requests, trips, ratings
and payments, and ships a complete **PL/SQL** layer: distance/assignment/payment
logic, integrity and lifecycle triggers, exception handling, and physical-storage
tuning for the largest tables.

Built and tested on **Oracle Database 21c XE**.

---

## Tech stack

- **Oracle Database** 21c XE (compatible with 11g/19c)
- **SQL** (DDL + queries/views)
- **PL/SQL** (functions, procedures, triggers, transactions, exceptions)
- Data model authored in **dbdiagram.io** (DBML) and **draw.io**

---

## Repository structure

```
tvdept/
├── database/
│   ├── 00_setup_user.sql        # create the application schema/user (run as DBA)
│   ├── 01_schema/tables.sql     # 14 tables + PK/FK/CHECK constraints
│   ├── 02_data/insert_data.sql  # sample dataset
│   ├── 03_views/views.sql       # analytical views
│   ├── 04_plsql/
│   │   ├── 00_schema_changes.sql   # sequences, shift counters, status values
│   │   ├── 01_functions.sql        # distance / billing / lookup functions
│   │   ├── 02_procedures.sql       # driver assignment, payments, deactivation
│   │   ├── 03_triggers.sql         # availability, rating, trip-end, audit
│   │   ├── 04_extra_objects.sql    # extra earnings/geo objects
│   │   ├── 05_integrity.sql        # value/date/temporal integrity rules
│   │   └── 06_physical_params.sql  # storage parameters for the largest tables
│   ├── install.sql              # master script — builds everything in order
│   └── tests/smoke_tests.sql    # exercises every object (rolls back)
├── model/
│   ├── tvdept.dbml              # physical table model (dbdiagram.io)
│   └── er-diagram.drawio        # ER diagram (draw.io)
└── tools/
    └── generate_er.py           # regenerates the draw.io ER diagram
```

---

## Quick start

1. **Create the application user** (connected as a DBA):
   ```bash
   sqlplus / as sysdba @database/00_setup_user.sql
   ```
2. **Build the whole database** (connected as the app user):
   ```bash
   sqlplus tvdept/tvdept @database/install.sql
   ```
   `install.sql` runs schema → data → views → PL/SQL in order, then reports any
   invalid objects (should be none).
3. **Run the demo / smoke tests** (all changes are rolled back):
   ```bash
   sqlplus tvdept/tvdept @database/tests/smoke_tests.sql
   ```

> The default password (`tvdept`) is for local use only — change it before any
> real deployment.

---

## What's inside

**Schema (14 tables):** client, driver, vehicle, driver_vehicle, tariff,
driver_schedule, location, trip_request, trip_preferences, trip, client_rating,
driver_rating, driver_payment, trip_process.

**Views:** analytical queries over trips, drivers, clients and ratings
(activity by weekday, revenue per driver, cancellations by age group, driver
proximity, rating distributions, smart-vehicle stats, regional pricing, …).

**Functions**
- `distancia_linear` — great-circle (Haversine) distance between two points
- `motorista_mais_proximo` — nearest available driver within a radius
- `valor_medio_diario` — amount billed by a driver in a period
- `data_ultima_viagem` — last trip with a given client on a given vehicle
- `distancia_entre` — distance between a driver and a client
- `distancia_das_viagens` — distance driven in the last active shift
- plus: monthly net earnings, estimated trip-request distance

**Procedures**
- `aloca_motorista` — assign the closest suitable driver to a request
- `paga_aos_motoristas` — batch driver payouts by thresholds
- `cancela_motoristas` — deactivate persistently low-rated drivers
- plus: single-driver payment registration, request cancellation

**Triggers**
- `update_status` — block going offline mid-trip / release pending requests
- `cliente_Avalia` — validate ratings and keep client counters
- `viagem_Terminada` — free the driver and update shift totals on trip end
- `update_pedido` — audit every trip-request status change
- plus: real-time driver rating update, request status-transition guard,
  and temporal triggers for date integrity (no future birth/registration dates)

**Integrity & tuning**
- CHECK constraints for non-negative money/distance/duration, valid date
  ordering, and payment consistency (`net = gross − commission`)
- Storage parameters (PCTFREE/INITRANS) for the five fastest-growing tables

---

## Data model

Open `model/tvdept.dbml` at [dbdiagram.io](https://dbdiagram.io) for the physical
model, and `model/er-diagram.drawio` at [draw.io](https://app.diagrams.net) for
the ER diagram.

---

## License

[MIT](LICENSE)

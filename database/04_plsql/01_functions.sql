-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- CHECKPOINT 3 - FUNCTIONS  (items a, b, c, d, e, m)
-- ----------------------------------------------------------------------------
-- All distances are linear ("straight line") distances in kilometres,
-- computed with the Haversine formula (Earth radius = 6371 km), the same
-- formula already used in VIEW_G of checkpoint 2.
--
-- Exception codes used (see enunciado, section "Tratamento de excecoes"):
--   -20801 Driver code does not exist
--   -20802 Client code does not exist
--   -20807 Driver unavailable / no driver available
--   -20811 Invalid period
--   -20812 Plate does not exist
--   -20813 Unknown client
--   -20814 Multiple clients with that name
-- ============================================================================

   SET DEFINE OFF

-- ============================================================================
-- m) distancia_linear(lat1, long1, lat2, long2) RETURN NUMBER
-- ----------------------------------------------------------------------------
-- Returns the linear (great-circle) distance in km between two GPS points.
-- This is the lowest-level geo helper; every other distance function and
-- the aloca_motorista procedure build on top of it.
-- ============================================================================
create or replace function distancia_linear (
   lat1  number,
   long1 number,
   lat2  number,
   long2 number
) return number is
   c_pi     constant number := 3.14159265358979;
   c_radius constant number := 6371; -- Earth radius in km
   v_rlat1  number;
   v_rlat2  number;
   v_dlat   number;
   v_dlong  number;
   v_a      number;
begin
   -- If any coordinate is missing we cannot compute a distance.
   if lat1 is null
   or long1 is null
   or lat2 is null
   or long2 is null then
      return null;
   end if;

   -- Convert degrees to radians
   v_rlat1 := lat1 * c_pi / 180;
   v_rlat2 := lat2 * c_pi / 180;
   v_dlat := ( lat2 - lat1 ) * c_pi / 180;
   v_dlong := ( long2 - long1 ) * c_pi / 180;

   -- Haversine formula
   v_a := sin(v_dlat / 2) * sin(v_dlat / 2) + cos(v_rlat1) * cos(v_rlat2) * sin(v_dlong / 2) * sin(v_dlong / 2);

   -- Clamp to [0,1] so SQRT/ASIN never raise ORA-01428 due to rounding
   if v_a > 1 then
      v_a := 1;
   elsif v_a < 0 then
      v_a := 0;
   end if;

   return round(
      c_radius * 2 * asin(sqrt(v_a)),
      2
   );
end distancia_linear;
/
SHOW ERRORS

-- ============================================================================
-- a) motorista_mais_proximo(lat, long, raio) RETURN NUMBER
-- ----------------------------------------------------------------------------
-- Returns the id of the closest AVAILABLE driver to the point (lat,long)
-- that is within "raio" km. Raises -20807 if no available driver is in range.
-- NOTE: the parameter the enunciado calls "long" is renamed to p_long because
--       LONG is a reserved word in Oracle and cannot be used inside SQL.
--       Positional calls -- motorista_mais_proximo(lat, long, raio) -- are
--       therefore unaffected.
-- ============================================================================
create or replace function motorista_mais_proximo (
   p_lat  number,
   p_long number,
   p_raio number
) return number is
   v_driver_id driver.driver_id%type;
begin
   select driver_id
     into v_driver_id
     from (
      select d.driver_id
        from driver d
       where d.status = 'AVAILABLE'
         and d.latitude is not null
         and d.longitude is not null
         and distancia_linear(
         p_lat,
         p_long,
         d.latitude,
         d.longitude
      ) <= p_raio
       order by distancia_linear(
         p_lat,
         p_long,
         d.latitude,
         d.longitude
      )
   )
    where rownum = 1;

   return v_driver_id;
exception
   when no_data_found then
      raise_application_error(
         -20807,
         'Motorista indisponivel. Nenhum motorista disponivel no raio indicado.'
      );
end motorista_mais_proximo;
/
SHOW ERRORS

-- ============================================================================
-- b) valor_medio_diario(idMotorista, dataInicio, dataFim) RETURN NUMBER
-- ----------------------------------------------------------------------------
-- Despite the name, the enunciado asks for the TOTAL amount billed by the
-- driver on trips that both started AND ended within the given period.
-- Raises -20801 if the driver does not exist, -20811 if the period is invalid.
-- ============================================================================
create or replace function valor_medio_diario (
   idmotorista number,
   datainicio  date,
   datafim     date
) return number is
   v_exists number;
   v_total  number;
begin
   -- Validate the driver
   select count(*)
     into v_exists
     from driver
    where driver_id = idmotorista;

   if v_exists = 0 then
      raise_application_error(
         -20801,
         'Codigo de motorista inexistente: ' || idmotorista
      );
   end if;

   -- Validate the period
   if datainicio is null
   or datafim is null
   or datafim < datainicio then
      raise_application_error(
         -20811,
         'Periodo invalido.'
      );
   end if;

   -- Total billed for trips started and ended within the period
   select nvl(
      sum(t.value),
      0
   )
     into v_total
     from trip t
    where t.driver_id = idmotorista
      and t.status = 'COMPLETED'
      and t.start_date >= datainicio
      and t.end_date <= datafim;

   return v_total;
end valor_medio_diario;
/
SHOW ERRORS

-- ============================================================================
-- c) data_ultima_viagem(matricula, nome_cliente) RETURN DATE
-- ----------------------------------------------------------------------------
-- Returns the date of the last trip done with the given vehicle (plate) for
-- the given client. Raises -20812 if the plate is unknown, -20813 if the
-- client name is unknown, -20814 if the name is ambiguous (more than one).
-- ============================================================================
create or replace function data_ultima_viagem (
   matricula    varchar2,
   nome_cliente varchar2
) return date is
   v_vehicle_id vehicle.vehicle_id%type;
   v_client_id  client.client_id%type;
   v_count      number;
   v_last_date  date;
begin
   -- Resolve the vehicle by plate
   begin
      select vehicle_id
        into v_vehicle_id
        from vehicle
       where plate = matricula;
   exception
      when no_data_found then
         raise_application_error(
            -20812,
            'Matricula inexistente: ' || matricula
         );
   end;

   -- Resolve the client by name (must be exactly one)
   select count(*)
     into v_count
     from client
    where name = nome_cliente;

   if v_count = 0 then
      raise_application_error(
         -20813,
         'Cliente desconhecido: ' || nome_cliente
      );
   elsif v_count > 1 then
      raise_application_error(
         -20814,
         'Multiplos clientes com o nome: ' || nome_cliente
      );
   end if;

   select client_id
     into v_client_id
     from client
    where name = nome_cliente;

   -- Last completed trip with that vehicle for that client
   select max(t.end_date)
     into v_last_date
     from trip t
     join trip_request tr
   on tr.request_id = t.request_id
    where t.vehicle_id = v_vehicle_id
      and tr.client_id = v_client_id
      and t.status = 'COMPLETED';

   return v_last_date;
end data_ultima_viagem;
/
SHOW ERRORS

-- ============================================================================
-- d) distancia_entre(idMotorista, idCliente) RETURN NUMBER
-- ----------------------------------------------------------------------------
-- Returns the linear distance in km between the current positions of a driver
-- and a client. Raises -20801 if the driver does not exist, -20802 if the
-- client does not exist.
-- ============================================================================
create or replace function distancia_entre (
   idmotorista number,
   idcliente   number
) return number is
   v_dlat  driver.latitude%type;
   v_dlong driver.longitude%type;
   v_clat  client.latitude%type;
   v_clong client.longitude%type;
begin
   -- Driver position
   begin
      select latitude,
             longitude
        into
         v_dlat,
         v_dlong
        from driver
       where driver_id = idmotorista;
   exception
      when no_data_found then
         raise_application_error(
            -20801,
            'Codigo de motorista inexistente: ' || idmotorista
         );
   end;

   -- Client position
   begin
      select latitude,
             longitude
        into
         v_clat,
         v_clong
        from client
       where client_id = idcliente;
   exception
      when no_data_found then
         raise_application_error(
            -20802,
            'Codigo de cliente inexistente: ' || idcliente
         );
   end;

   return distancia_linear(
      v_dlat,
      v_dlong,
      v_clat,
      v_clong
   );
end distancia_entre;
/
SHOW ERRORS

-- ============================================================================
-- e) distancia_das_viagens(idMotorista) RETURN NUMBER 
-- ----------------------------------------------------------------------------
-- Considering the sequence of trips done by the driver during the last period
-- in which he was active (his most recent shift / online period, i.e. the
-- latest DRIVER_SCHEDULE start_time), returns the total distance travelled
-- on trips with passengers. Raises -20801 if the driver does not exist.
-- ============================================================================
create or replace function distancia_das_viagens (
   idmotorista number
) return number is
   v_exists     number;
   v_last_start date;
   v_total      number;
begin
   select count(*)
     into v_exists
     from driver
    where driver_id = idmotorista;

   if v_exists = 0 then
      raise_application_error(
         -20801,
         'Codigo de motorista inexistente: ' || idmotorista
      );
   end if;

   -- Start of the last active period (most recent shift)
   select max(start_time)
     into v_last_start
     from driver_schedule
    where driver_id = idmotorista;

   -- Sum the distance of the completed trips since that moment
   -- (NVL fallback: if the driver has no shift recorded, consider all trips)
   select nvl(
      sum(t.distance_km),
      0
   )
     into v_total
     from trip t
    where t.driver_id = idmotorista
      and t.status = 'COMPLETED'
      and t.start_date >= nvl(
      v_last_start,
      t.start_date
   );

   return v_total;
end distancia_das_viagens;
/
SHOW ERRORS

pro    === CP3 functions created ===
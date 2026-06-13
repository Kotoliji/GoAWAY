-- ============================================
-- AABD 2025/2026 - Practical Assignment
-- TVDEPT
-- Views - Checkpoint 2
-- ============================================

-- ============================================
-- VIEW_A
-- For the Coimbra region, shows clients and the periods
-- when trip requests were registered that did NOT result
-- in actual trips. Also shows the date of the client's
-- previous trip and total number of trips completed.  
-- ============================================
create or replace view view_a as
   select c.name as nome_cliente,
          to_char(
             tr.request_date,
             'DD/MM/YYYY HH24"H"MI'
          ) as data_hora,
          tr.dest_name as local,
    -- Date of the last trip before the unfulfilled request
          (
             select to_char(
                max(t2.end_date),
                'DD/MM/YYYY HH24"H"MI'
             )
               from trip t2
               join trip_request tr2
             on t2.request_id = tr2.request_id
              where tr2.client_id = c.client_id
                and t2.end_date < tr.request_date
          ) as ultima_data,
    -- Total number of trips by this client
          (
             select count(*)
               from trip t3
               join trip_request tr3
             on t3.request_id = tr3.request_id
              where tr3.client_id = c.client_id
          ) as num_viagens
     from trip_request tr
     join client c
   on c.client_id = tr.client_id
-- Requests that did NOT result in a trip
    where tr.request_id not in (
      select request_id
        from trip
   )
-- Coimbra region only
      and tr.origin_address like '%Coimbra%'
    order by tr.request_date;

-- ============================================
-- VIEW_B
-- By day of week, considering trips from the last month,
-- shows the number of trips completed, the total trip
-- duration, and the total time drivers were available
-- on that day of the week.
-- ============================================
create or replace view view_b as
   select dia.dia_semana,
          dia.num_viagens,
          dia.tempo_total_viagens,
    -- Total available time of drivers on this day of week
          nvl(
             floor(sched.total_min / 60)
             || 'H'
             || lpad(
                mod(
                   sched.total_min,
                   60
                ),
                2,
                '0'
             )
             || 'M',
             '0H00M'
          ) as tempo_total_disponivel
     from (
    -- Trips grouped by day of week
      select to_char(
         t.start_date,
         'DAY'
      ) as dia_semana,
             to_number(to_char(
                t.start_date,
                'D'
             )) as dia_num,
             count(*) as num_viagens,
             floor(sum((t.end_date - t.start_date) * 24 * 60) / 60)
             || 'H'
             || lpad(
                mod(
                   floor(sum((t.end_date - t.start_date) * 24 * 60)),
                   60
                ),
                2,
                '0'
             )
             || 'M' as tempo_total_viagens
        from trip t
       where t.start_date >= add_months(
            sysdate,
            -1
         )
         and t.status = 'COMPLETED'
       group by to_char(
         t.start_date,
         'DAY'
      ),
                to_number(to_char(
                   t.start_date,
                   'D'
                ))
   ) dia
     left join (
    -- Total available hours per day of week
      select ds.day_of_week,
             floor(sum((ds.end_time - ds.start_time) * 24 * 60)) as total_min
        from driver_schedule ds
       group by ds.day_of_week
   ) sched
   on sched.day_of_week = dia.dia_num
    order by dia.dia_num;

-- ============================================
-- VIEW_C
-- For each driver, shows the number of trips this month
-- and total revenue, as well as accumulated revenue and
-- trip count since registration on the platform.
-- Only includes drivers whose average revenue exceeds
-- the average of drivers with the same vehicle type.
-- Sorted descending by total number of trips.
-- ============================================
create or replace view view_c as
   select d.name as nome_motorista,
    -- Trips this month
          (
             select count(*)
               from trip t2
              where t2.driver_id = d.driver_id
                and extract(month from t2.start_date) = extract(month from sysdate)
                and extract(year from t2.start_date) = extract(year from sysdate)
                and t2.status = 'COMPLETED'
          ) as num_viagens,
    -- Revenue this month
          (
             select nvl(
                sum(t3.value),
                0
             )
               from trip t3
              where t3.driver_id = d.driver_id
                and extract(month from t3.start_date) = extract(month from sysdate)
                and extract(year from t3.start_date) = extract(year from sysdate)
                and t3.status = 'COMPLETED'
          ) as valor_mes,
    -- Total trips since registration
          (
             select count(*)
               from trip t4
              where t4.driver_id = d.driver_id
                and t4.status = 'COMPLETED'
          ) as num_total_viagens,
    -- Total accumulated revenue since registration
          (
             select nvl(
                sum(t5.value),
                0
             )
               from trip t5
              where t5.driver_id = d.driver_id
                and t5.status = 'COMPLETED'
          ) as valor_total_acumula
     from driver d
    where (
    -- Driver's average revenue
      select nvl(
         avg(t6.value),
         0
      )
        from trip t6
       where t6.driver_id = d.driver_id
         and t6.status = 'COMPLETED'
   ) > (
    -- Average revenue of drivers with the same fuel type
      select nvl(
         avg(t7.value),
         0
      )
        from trip t7
        join vehicle v2
      on v2.vehicle_id = t7.vehicle_id
       where v2.fuel_type in (
         select v3.fuel_type
           from driver_vehicle dv
           join vehicle v3
         on v3.vehicle_id = dv.vehicle_id
          where dv.driver_id = d.driver_id
      )
         and t7.status = 'COMPLETED'
   )
    order by num_total_viagens desc;

-- ============================================
-- VIEW_D
-- Shows the number and total value of cancellation fees
-- by client age group (decades: 20-29, 30-39, etc.),
-- and how the value has changed percentage-wise compared
-- to the previous month. Considers the last 12 full months.
-- Excludes clients with only a single cancellation.
-- ============================================
create or replace view view_d as
   select faixa.faixa_etaria,
          faixa.num_cancela,
          faixa.valor_cancel,
          nvl(
             ant.valor_cancel,
             0
          ) as valor_mes_ant,
          case
             when nvl(
                ant.valor_cancel,
                0
             ) = 0 then
                0
             else
                round(
                   (faixa.valor_cancel - ant.valor_cancel) / ant.valor_cancel * 100,
                   1
                )
          end as variacao_percent
     from (
    -- Cancellations by age group in the current period
      select floor(months_between(
         sysdate,
         c.birth_date
      ) / 12 / 10) * 10
             || '-'
             || ( floor(months_between(
         sysdate,
         c.birth_date
      ) / 12 / 10) * 10 + 9 ) as faixa_etaria,
             floor(months_between(
                sysdate,
                c.birth_date
             ) / 12 / 10) as faixa_num,
             count(*) as num_cancela,
             sum(tr.proposed_value) as valor_cancel
        from trip_request tr
        join client c
      on c.client_id = tr.client_id
       where tr.status = 'CANCELLED'
         and tr.cancellation_date >= add_months(
         trunc(
            sysdate,
            'MM'
         ),
         -12
      )
         and tr.cancellation_date < trunc(
         sysdate,
         'MM'
      )
      -- Exclude clients with only 1 cancellation
         and c.client_id in (
         select tr2.client_id
           from trip_request tr2
          where tr2.status = 'CANCELLED'
          group by tr2.client_id
         having count(*) > 1
      )
       group by floor(months_between(
         sysdate,
         c.birth_date
      ) / 12 / 10)
   ) faixa
     left join (
    -- Cancellations by age group in the previous month
      select floor(months_between(
         sysdate,
         c.birth_date
      ) / 12 / 10) as faixa_num,
             sum(tr.proposed_value) as valor_cancel
        from trip_request tr
        join client c
      on c.client_id = tr.client_id
       where tr.status = 'CANCELLED'
         and tr.cancellation_date >= add_months(
         trunc(
            sysdate,
            'MM'
         ),
         -2
      )
         and tr.cancellation_date < add_months(
         trunc(
            sysdate,
            'MM'
         ),
         -1
      )
         and c.client_id in (
         select tr2.client_id
           from trip_request tr2
          where tr2.status = 'CANCELLED'
          group by tr2.client_id
         having count(*) > 1
      )
       group by floor(months_between(
         sysdate,
         c.birth_date
      ) / 12 / 10)
   ) ant
   on ant.faixa_num = faixa.faixa_num
    order by faixa.num_cancela desc;

-- ============================================
-- VIEW_E
-- For the driver with the most trips this year, shows
-- a chronological listing of completed trips. For each
-- trip: start/end date-time, duration, fare, and client
-- rating. Only considers clients whose average rating
-- is above 4.3.
-- ============================================
create or replace view view_e as
   select to_char(
      t.start_date,
      'DD-MM-YYYY HH24"h"MI'
   ) as inicio,
          to_char(
             t.end_date,
             'DD-MM-YYYY HH24"h"MI'
          ) as fim,
          round((t.end_date - t.start_date) * 24 * 60) as duracao,
          t.value as valor,
          cr.score as avaliacao
     from trip t
-- Client rating (may not exist)
     left join client_rating cr
   on cr.trip_id = t.request_id
-- Request data to get client_id
     join trip_request tr
   on tr.request_id = t.request_id
    where t.driver_id = (
    -- Driver with the most trips this year
         select driver_id
           from (
            select driver_id,
                   count(*) as cnt
              from trip
             where extract(year from start_date) = extract(year from sysdate)
               and status = 'COMPLETED'
             group by driver_id
             order by cnt desc
         )
          where rownum = 1
      )
      and extract(year from t.start_date) = extract(year from sysdate)
      and t.status = 'COMPLETED'
-- Only clients with average rating > 4.3
      and tr.client_id in (
      select tr2.client_id
        from trip t2
        join trip_request tr2
      on tr2.request_id = t2.request_id
        join client_rating cr2
      on cr2.trip_id = t2.request_id
       where extract(year from t2.start_date) = extract(year from sysdate)
       group by tr2.client_id
      having avg(cr2.score) > 4.3
   )
    order by t.start_date;

-- ============================================
-- VIEW_F
-- For each driver, shows the most frequently given
-- rating (mode) for trips completed last month.
-- Shows trip count, most frequent rating, and the
-- number of trips with that rating.
-- Excludes drivers with fewer than 20 trips.
-- Drivers with the lowest mode appear at the end.
-- ============================================
create or replace view view_f as
   select m.driver_id as idmotorista,
          m.name as nome,
          m.total_viagens as num_viagens,
          m.score as avaliacao_mais_freq,
          m.score_count as num_viagens_aval_freq
     from (
      select d.driver_id,
             d.name,
             cr.score,
             count(*) as score_count,
        -- Total trips by this driver last month
             (
                select count(*)
                  from trip t2
                 where t2.driver_id = d.driver_id
                   and t2.start_date >= add_months(
                   trunc(
                      sysdate,
                      'MM'
                   ),
                   -1
                )
                   and t2.start_date < trunc(
                   sysdate,
                   'MM'
                )
                   and t2.status = 'COMPLETED'
             ) as total_viagens,
        -- Rank to get the mode (most frequent score)
             row_number()
             over(partition by d.driver_id
                  order by count(*) desc,
                           cr.score desc
             ) as rn
        from driver d
        join trip t
      on t.driver_id = d.driver_id
        join client_rating cr
      on cr.trip_id = t.request_id
       where t.start_date >= add_months(
            trunc(
               sysdate,
               'MM'
            ),
            -1
         )
         and t.start_date < trunc(
         sysdate,
         'MM'
      )
         and t.status = 'COMPLETED'
       group by d.driver_id,
                d.name,
                cr.score
   ) m
    where m.rn = 1
      and m.total_viagens >= 20
    order by m.score desc,
             m.score_count desc;

-- ============================================
-- VIEW_G
-- Gets available drivers within a 30 km radius of ISEC
-- who drive an electric vehicle. Uses linear distance
-- (in km) between locations. For each driver shows:
-- last trip end date, number of trips since the last
-- online period, and average rating from the last week.
-- Sorted by proximity.
-- ISEC coordinates: 40.1867, -8.4155
-- ============================================
create or replace view view_g as
   select d.driver_id as idmotorista,
          d.name as nome,
    -- Linear distance in km (simplified Haversine formula)
          round(
             6371 * acos(cos(d.latitude * 3.14159 / 180) * cos(40.1867 * 3.14159 / 180) * cos(((-8.4155) - d.longitude) * 3.14159 / 180
             ) + sin(d.latitude * 3.14159 / 180) * sin(40.1867 * 3.14159 / 180)),
             1
          ) as distancia_linear,
    -- Date of the last completed trip
          (
             select to_char(
                max(t2.end_date),
                'DD/MM/YYYY HH24"H"MI'
             )
               from trip t2
              where t2.driver_id = d.driver_id
                and t2.status = 'COMPLETED'
          ) as data_ult_viagem,
    -- Number of trips since the last online period
          (
             select count(*)
               from trip t3
              where t3.driver_id = d.driver_id
                and t3.status = 'COMPLETED'
                and t3.start_date >= (
                select max(ds2.start_time)
                  from driver_schedule ds2
                 where ds2.driver_id = d.driver_id
             )
          ) as n_viagens,
    -- Average rating from trips in the last week
          (
             select round(
                avg(cr.score),
                1
             )
               from client_rating cr
               join trip t4
             on t4.request_id = cr.trip_id
              where t4.driver_id = d.driver_id
                and t4.start_date >= sysdate - 7
          ) as nota_media
     from driver d
    where d.status = 'AVAILABLE'
-- Within 30 km radius of ISEC
      and 6371 * acos(cos(d.latitude * 3.14159 / 180) * cos(40.1867 * 3.14159 / 180) * cos(((-8.4155) - d.longitude) * 3.14159 / 180
      ) + sin(d.latitude * 3.14159 / 180) * sin(40.1867 * 3.14159 / 180)) <= 30
-- Drives an electric vehicle
      and d.driver_id in (
      select dv.driver_id
        from driver_vehicle dv
        join vehicle v
      on v.vehicle_id = dv.vehicle_id
       where v.fuel_type = 'Electric'
   )
    order by distancia_linear;

-- ============================================
-- VIEW_H
-- Considering trips from 2024 and 2025, gets the
-- average number of monthly trips for each vehicle
-- category and model. Only includes available drivers
-- who had above-average trip counts in that period.
-- Sorted descending by average and vehicle category.
-- ============================================
create or replace view view_h as
   select v.vehicle_type as categoria,
          v.brand as marca,
          v.model as modelo,
          round(count(*) / count(distinct extract(month from t.start_date)
                                          || '-'
                                          || extract(year from t.start_date))) as mediamensal
     from trip t
     join vehicle v
   on v.vehicle_id = t.vehicle_id
     join driver d
   on d.driver_id = t.driver_id
    where t.status = 'COMPLETED'
      and extract(year from t.start_date) in ( 2024,
                                               2025 )
      and d.status = 'AVAILABLE'
  -- Only drivers with above-average trip counts
      and t.driver_id in (
      select t2.driver_id
        from trip t2
       where extract(year from t2.start_date) in ( 2024,
                                                   2025 )
         and t2.status = 'COMPLETED'
       group by t2.driver_id
      having count(*) > (
         select avg(cnt)
           from (
            select count(*) as cnt
              from trip t3
             where extract(year from t3.start_date) in ( 2024,
                                                         2025 )
               and t3.status = 'COMPLETED'
             group by t3.driver_id
         )
      )
   )
    group by v.vehicle_type,
             v.brand,
             v.model
    order by mediamensal desc,
             v.vehicle_type;

-- ============================================
-- VIEW_I
-- Considering ratings (1 to 5 stars) given to each trip,
-- calculates the percentage of trips each driver received
-- for each rating. Shows the top 5 drivers with the
-- highest percentage for each rating. Only trips over
-- 50 km completed last month.
-- Sorted descending by rating and percentage.
-- ============================================
create or replace view view_i as
   select classificacao,
          percentagem,
          num_viagens,
          nome,
          matricula,
          veiculo
     from (
    -- Step 2: rank by percentage within each rating
      select classificacao,
             percentagem,
             num_viagens,
             nome,
             matricula,
             veiculo,
             row_number()
             over(partition by classificacao
                  order by percentagem desc
             ) as rn
        from (
        -- Step 1: compute percentage per (driver, rating)
         select cr.score as classificacao,
                round(
                   count(*) * 100.0 / sum(count(*))
                                      over(partition by t.driver_id),
                   1
                ) as percentagem,
                count(*) as num_viagens,
                d.name as nome,
                v.plate as matricula,
                v.brand
                || ' '
                || v.model as veiculo
           from trip t
           join client_rating cr
         on cr.trip_id = t.request_id
           join driver d
         on d.driver_id = t.driver_id
           join vehicle v
         on v.vehicle_id = t.vehicle_id
          where t.distance_km > 50
            and t.status = 'COMPLETED'
            and t.start_date >= add_months(
            trunc(
               sysdate,
               'MM'
            ),
            -1
         )
            and t.start_date < trunc(
            sysdate,
            'MM'
         )
          group by cr.score,
                   t.driver_id,
                   d.name,
                   v.plate,
                   v.brand,
                   v.model
      ) base
   )
    where rn <= 5
    order by classificacao desc,
             percentagem desc;

-- ============================================
-- VIEW_E_ (SELECT with GROUP BY)
-- Analyzes the efficiency of smart vehicles available
-- on the platform. For each model, shows the number of
-- completed trips, the average fare charged, the average
-- distance traveled, and the average trip duration.
-- The results are grouped by vehicle model (GROUP BY).
-- ============================================
create or replace view view_e1_ as
   select v.brand
          || ' '
          || v.model as modelo,
          count(*) as num_viagens,
          round(
             avg(t.value),
             2
          ) as valor_medio,
          round(
             avg(t.distance_km),
             1
          ) as distancia_media,
          round(
             avg((t.end_date - t.start_date) * 24 * 60),
             0
          ) as tempo_medio_min
     from trip t
     join vehicle v
   on v.vehicle_id = t.vehicle_id
    where t.status = 'COMPLETED'
      and v.vehicle_type = 'AI'
    group by v.brand,
             v.model
    order by num_viagens desc;

-- ============================================
-- VIEW_E_ (Nested SELECT)
-- Identifies drivers whose average client rating is
-- below the global average rating of all drivers.
-- For each driver shows total completed trips and
-- the date of the last trip.
-- ============================================
create or replace view view_e2_ as
   select d.driver_id as idmotorista,
          d.name as nome,
          d.avg_score as avaliacao_media,
          (
             select count(*)
               from trip t
              where t.driver_id = d.driver_id
                and t.status = 'COMPLETED'
          ) as num_viagens,
          (
             select to_char(
                max(t2.end_date),
                'DD/MM/YYYY HH24"H"MI'
             )
               from trip t2
              where t2.driver_id = d.driver_id
                and t2.status = 'COMPLETED'
          ) as ultima_viagem
     from driver d
    where d.avg_score < (
      select avg(avg_score)
        from driver
       where avg_score is not null
   )
    order by d.avg_score;

-- ============================================
-- VIEW_K_ (SELECT with GROUP BY)
-- Analyzes client preferences regarding the choice of
-- smart vehicle brand and model through payment of an
-- additional fee. For each brand and model, shows the
-- number of times it was selected with an extra fee,
-- the total amount of fees charged, and the average
-- rating for those trips. Grouped by brand and model.
-- ============================================
create or replace view view_k1_ as
   select substr(
      tp.preferred_model,
      1,
      instr(
         tp.preferred_model,
         ' '
      ) - 1
   ) as marca,
          substr(
             tp.preferred_model,
             instr(
                tp.preferred_model,
                ' '
             ) + 1
          ) as modelo,
          count(*) as num_escolhas,
          sum(tp.extra_fee) as total_taxas,
          round(
             avg(cr.score),
             1
          ) as avaliacao_media
     from trip_preferences tp
     join trip_request tr
   on tr.request_id = tp.request_id
     join trip t
   on t.request_id = tr.request_id
     left join client_rating cr
   on cr.trip_id = t.request_id
    where tp.smart_vehicle = 1
      and tp.preferred_model is not null
    group by substr(
      tp.preferred_model,
      1,
      instr(
         tp.preferred_model,
         ' '
      ) - 1
   ),
             substr(
                tp.preferred_model,
                instr(
                   tp.preferred_model,
                   ' '
                ) + 1
             )
    order by num_escolhas desc;

-- ============================================
-- VIEW_K_ (Nested SELECT)
-- NOTE: Proposal changed from checkpoint 1.
-- Original proposal: clients with more trips than average.
-- New proposal: dynamic pricing analysis by region.
--
-- Analyzes the average price per km in each departure
-- region and compares it with the platform-wide global
-- average (nested SELECT). A coefficient above 1 means
-- the region is priced above average; below 1 means
-- cheaper. Useful for implementing surge pricing and
-- balancing supply/demand by zone.
-- ============================================
create or replace view view_k2_ as
   select regiao.regiao_partida,
          regiao.num_viagens,
          regiao.preco_medio_km,
    -- Coefficient: regional price / global average price
          round(
             regiao.preco_medio_km / nvl(
                nullif(
                   (
        -- Nested SELECT: global average price per km
                      select avg(t2.value / t2.distance_km)
                        from trip t2
                       where t2.status = 'COMPLETED'
                         and t2.distance_km > 0
                   ),
                   0
                ),
                1
             ),
             2
          ) as coeficiente_preco
     from (
      select
        -- Extract region (last part of origin address after comma)
       substr(
         tr.origin_address,
         instr(
              tr.origin_address,
              ',',
              -1
           ) + 2
      ) as regiao_partida,
             count(*) as num_viagens,
             round(
                avg(t.value / t.distance_km),
                2
             ) as preco_medio_km
        from trip t
        join trip_request tr
      on tr.request_id = t.request_id
       where t.status = 'COMPLETED'
         and t.distance_km > 0
       group by substr(
         tr.origin_address,
         instr(
              tr.origin_address,
              ',',
              -1
           ) + 2
      )
   ) regiao
    order by coeficiente_preco desc;
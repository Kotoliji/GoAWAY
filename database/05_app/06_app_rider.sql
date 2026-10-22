-- ============================================================================
-- TVDEPT - Oracle Database (PL/SQL)
-- APPLICATION LAYER - rider: price quote and one rating per trip
-- ----------------------------------------------------------------------------
-- Depends on: 04_plsql (distancia_linear), 01_schema (tariff, vehicle).
-- ============================================================================

SET DEFINE OFF

-- A client rates a trip once (the API turns ORA-00001 into 409).
ALTER TABLE client_rating
   ADD CONSTRAINT uq_client_rating_trip UNIQUE ( trip_id, client_id );

-- Quote before ordering: straight-line distance, the fare range over the
-- tariffs of the fuel types used by that vehicle class (same formula as the
-- final fare: base_fee + price_per_km * km), and how many free drivers of
-- that class are within 5 km (same rules as aloca_motorista) + the nearest.
CREATE OR REPLACE PROCEDURE app_quote (
   p_origin_lat   IN  NUMBER,
   p_origin_long  IN  NUMBER,
   p_dest_lat     IN  NUMBER,
   p_dest_long    IN  NUMBER,
   p_vehicle_type IN  VARCHAR2,
   o_km           OUT NUMBER,
   o_fare_min     OUT NUMBER,
   o_fare_max     OUT NUMBER,
   o_drivers      OUT NUMBER,
   o_nearest_km   OUT NUMBER
) IS
BEGIN
   o_km := distancia_linear(p_origin_lat, p_origin_long, p_dest_lat, p_dest_long);

   SELECT ROUND(MIN(t.base_fee + t.price_per_km * o_km), 2),
          ROUND(MAX(t.base_fee + t.price_per_km * o_km), 2)
     INTO o_fare_min, o_fare_max
     FROM tariff t
    WHERE t.fuel_type IN ( SELECT v.fuel_type FROM vehicle v
                            WHERE v.vehicle_type = p_vehicle_type );

   SELECT COUNT(*), MIN(dist)
     INTO o_drivers, o_nearest_km
     FROM (
      SELECT distancia_linear(p_origin_lat, p_origin_long, d.latitude, d.longitude) AS dist
        FROM driver d
       WHERE d.status = 'AVAILABLE'
         AND d.latitude IS NOT NULL
         AND EXISTS ( SELECT 1 FROM driver_vehicle dv
                        JOIN vehicle v ON v.vehicle_id = dv.vehicle_id
                       WHERE dv.driver_id = d.driver_id
                         AND v.vehicle_type = p_vehicle_type )
         AND NOT EXISTS ( SELECT 1 FROM trip_request x
                           WHERE x.driver_id = d.driver_id
                             AND x.status IN ( 'ASSIGNED', 'ACCEPTED', 'PICKED_UP' ) )
     )
    WHERE dist <= 5;
END app_quote;
/
SHOW ERRORS

PROMPT === TVDEPT rider objects created ===

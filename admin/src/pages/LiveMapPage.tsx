import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import { LatLngBoundsExpression } from 'leaflet';
import { get } from '../api';
import { Page, Status } from '../components/ui';
import { dateTime } from '../format';
import { useSocketEvent } from '../socket';
import { useTokens } from '../theme';

interface LiveRide {
  REQUEST_ID: number;
  STATUS: string;
  REQUEST_DATE: string;
  DRIVER_ID: number | null;
  CLIENT_NAME: string;
  PICKUP_LAT: number | null;
  PICKUP_LONG: number | null;
  DEST_NAME: string | null;
  DEST_LAT: number | null;
  DEST_LONG: number | null;
  DRIVER_NAME: string | null;
}

interface LiveDriver {
  DRIVER_ID: number;
  NAME: string;
  STATUS: 'AVAILABLE' | 'ON_TRIP';
  LATITUDE: number;
  LONGITUDE: number;
  AVG_SCORE: number | null;
}

const COIMBRA: [number, number] = [40.205, -8.42];

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

/** Fit the map once, on first load, to where most of the activity is: points
 *  within ~25 km of the median, so one far-away ride doesn't zoom out the country. */
function FitOnce({ points }: { points: [number, number][] }) {
  const map = useMap();
  const done = useRef(false);
  useEffect(() => {
    if (done.current || points.length === 0) return;
    done.current = true;
    const mLat = median(points.map((p) => p[0]));
    const mLong = median(points.map((p) => p[1]));
    const near = points.filter(([lat, long]) => Math.abs(lat - mLat) < 0.23 && Math.abs(long - mLong) < 0.3);
    map.fitBounds(near as LatLngBoundsExpression, { padding: [40, 40], maxZoom: 15 });
  }, [map, points]);
  return null;
}

export default function LiveMapPage() {
  const [rides, setRides] = useState<LiveRide[]>([]);
  const [drivers, setDrivers] = useState<Record<number, LiveDriver>>({});
  const [error, setError] = useState<string | null>(null);
  const c = useTokens(['series-1', 'series-2', 'series-3', 'surface']);

  const load = useCallback(async () => {
    try {
      const r = await get<{ rides: LiveRide[]; drivers: LiveDriver[] }>('/admin/live');
      setRides(r.rides);
      setDrivers(Object.fromEntries(r.drivers.map((d) => [d.DRIVER_ID, d])));
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 10000); // online/offline changes
    return () => window.clearInterval(t);
  }, [load]);

  useSocketEvent('ride:updated', load);
  useSocketEvent(
    'driver:moved',
    useCallback((p: { driverId: number; lat: number; long: number }) => {
      setDrivers((ds) => (ds[p.driverId] ? { ...ds, [p.driverId]: { ...ds[p.driverId], LATITUDE: p.lat, LONGITUDE: p.long } } : ds));
    }, []),
  );

  const driverList = Object.values(drivers);
  const points: [number, number][] = [
    ...driverList.map((d) => [d.LATITUDE, d.LONGITUDE] as [number, number]),
    ...rides.filter((r) => r.PICKUP_LAT != null).map((r) => [r.PICKUP_LAT!, r.PICKUP_LONG!] as [number, number]),
  ];
  const onTrip = driverList.filter((d) => d.STATUS === 'ON_TRIP').length;

  return (
    <Page title="Live map" subtitle="Online drivers and rides in progress. Positions stream in real time.">
      {error && <div className="error">{error}</div>}
      <div className="live-layout">
        <div className="map">
          <MapContainer center={COIMBRA} zoom={13} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitOnce points={points} />
            {rides.map((r) =>
              r.PICKUP_LAT != null && r.DEST_LAT != null ? (
                <Polyline
                  key={`l${r.REQUEST_ID}`}
                  positions={[[r.PICKUP_LAT, r.PICKUP_LONG!], [r.DEST_LAT, r.DEST_LONG!]]}
                  pathOptions={{ color: c['series-2'], weight: 2, dashArray: '6 6' }}
                />
              ) : null,
            )}
            {rides.map((r) =>
              r.PICKUP_LAT != null ? (
                <CircleMarker
                  key={`p${r.REQUEST_ID}`}
                  center={[r.PICKUP_LAT, r.PICKUP_LONG!]}
                  radius={7}
                  pathOptions={{ color: c.surface, weight: 2, fillColor: c['series-2'], fillOpacity: 1 }}
                >
                  <Tooltip>#{r.REQUEST_ID} {r.CLIENT_NAME} → {r.DEST_NAME ?? 'destination'} ({r.STATUS.toLowerCase()})</Tooltip>
                </CircleMarker>
              ) : null,
            )}
            {driverList.map((d) => (
              <CircleMarker
                key={`d${d.DRIVER_ID}`}
                center={[d.LATITUDE, d.LONGITUDE]}
                radius={8}
                pathOptions={{
                  color: c.surface,
                  weight: 2,
                  fillColor: d.STATUS === 'ON_TRIP' ? c['series-1'] : c['series-3'],
                  fillOpacity: 1,
                }}
              >
                <Tooltip>{d.NAME} · {d.STATUS === 'ON_TRIP' ? 'on trip' : 'available'}{d.AVG_SCORE != null ? ` · ★ ${Number(d.AVG_SCORE).toFixed(1)}` : ''}</Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        <div className="card">
          <div className="legend">
            <span><i style={{ background: c['series-3'] }} />Available driver ({driverList.length - onTrip})</span>
            <span><i style={{ background: c['series-1'] }} />On trip ({onTrip})</span>
            <span><i style={{ background: c['series-2'] }} />Pickup → destination</span>
          </div>
          <h2>Rides in progress ({rides.length})</h2>
          <div className="list">
            {rides.length === 0 && <div className="empty">No live rides right now.</div>}
            {rides.map((r) => (
              <div key={r.REQUEST_ID} className="list-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span className="strong">#{r.REQUEST_ID} {r.CLIENT_NAME}</span>
                  <Status value={r.STATUS} />
                </div>
                <div className="note">to {r.DEST_NAME ?? 'destination'} · {r.DRIVER_NAME ?? 'no driver yet'}</div>
                <div className="note">{dateTime(r.REQUEST_DATE)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Page>
  );
}

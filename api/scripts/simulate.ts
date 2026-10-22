/**
 * Demo traffic generator — makes the platform look alive for demos.
 *
 *   npm run simulate            (API on http://localhost:3000)
 *   SIM_DRIVERS=8 SIM_CLIENTS=6 SIM_SECONDS=120 API_URL=http://host:3000 npm run simulate
 *
 * Seeded drivers log in (password demo123), go online around Coimbra and stream
 * GPS over the socket. Simulated clients request rides; drivers accept (or now
 * and then decline), drive to the pickup, then to the destination, and finish;
 * clients rate the trip. Everything goes through the public API, so the
 * PL/SQL rules, pushes and the admin live map all run for real.
 * Ctrl+C (or SIM_SECONDS elapsing) takes the drivers offline again.
 */
import { io, Socket } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3000';
const N_DRIVERS = Number(process.env.SIM_DRIVERS ?? 6);
const N_CLIENTS = Number(process.env.SIM_CLIENTS ?? 5);
const SECONDS = Number(process.env.SIM_SECONDS ?? 0); // 0 = until Ctrl+C
const TICK_MS = 1000;
const STEP = 0.0006; // degrees per tick (~60 m): fast-forwarded city driving
const CENTER = { lat: 40.2033, long: -8.4103 }; // Coimbra

type Pos = { lat: number; long: number };
type Ride = { REQUEST_ID: number; STATUS: string; DRIVER_ID: number | null; CLIENT_LAT: number; CLIENT_LONG: number; DEST_LAT: number; DEST_LONG: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const around = (p: Pos, km: number): Pos => ({ lat: p.lat + rand(-km, km) / 111, long: p.long + rand(-km, km) / 85 });
const log = (...a: unknown[]) => console.log(new Date().toLocaleTimeString(), ...a);

async function call<T = any>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path}: ${data?.error ?? res.status}`);
  return data as T;
}

const login = (email: string, password: string) =>
  call<{ accessToken: string }>('POST', '/auth/login', undefined, { email, password }).then((r) => r.accessToken);

/** Move `from` one step towards `to`; true once there. */
function stepTowards(from: Pos, to: Pos): boolean {
  const dLat = to.lat - from.lat;
  const dLong = to.long - from.long;
  const d = Math.hypot(dLat, dLong);
  if (d <= STEP) {
    from.lat = to.lat;
    from.long = to.long;
    return true;
  }
  from.lat += (dLat / d) * STEP;
  from.long += (dLong / d) * STEP;
  return false;
}

class SimDriver {
  pos: Pos = around(CENTER, 3);
  ride: Ride | null = null;
  wanderTo: Pos = around(CENTER, 3);
  decideAt = 0;
  socket!: Socket;
  constructor(public name: string, public token: string) {}

  async start() {
    this.socket = io(API, { transports: ['websocket'], auth: { token: this.token } });
    this.socket.on('ride:updated', () => this.sync());
    await call('POST', '/driver/online', this.token, this.pos);
    await this.sync();
  }

  async sync() {
    try {
      const s = await call<{ ride: Ride | null }>('GET', '/driver/state', this.token);
      if (s.ride?.STATUS === 'ASSIGNED' && this.ride?.REQUEST_ID !== s.ride.REQUEST_ID) {
        this.decideAt = Date.now() + rand(2000, 5000); // "reads" the request first
      }
      this.ride = s.ride;
    } catch (e) {
      log(`${this.name}: ${(e as Error).message}`);
    }
  }

  async tick() {
    const r = this.ride;
    try {
      if (!r) {
        if (stepTowards(this.pos, this.wanderTo)) this.wanderTo = around(CENTER, 3);
      } else if (r.STATUS === 'ASSIGNED' && Date.now() >= this.decideAt) {
        if (Math.random() < 0.15) {
          log(`${this.name} declines #${r.REQUEST_ID}`);
          await call('POST', `/rides/${r.REQUEST_ID}/reject`, this.token);
        } else {
          log(`${this.name} accepts #${r.REQUEST_ID}`);
          await call('POST', `/rides/${r.REQUEST_ID}/accept`, this.token);
        }
        await this.sync();
      } else if (r.STATUS === 'ACCEPTED') {
        if (stepTowards(this.pos, { lat: r.CLIENT_LAT, long: r.CLIENT_LONG })) {
          log(`${this.name} picks up #${r.REQUEST_ID}`);
          await call('POST', `/rides/${r.REQUEST_ID}/pickup`, this.token);
          await this.sync();
        }
      } else if (r.STATUS === 'PICKED_UP') {
        if (stepTowards(this.pos, { lat: r.DEST_LAT, long: r.DEST_LONG })) {
          const done = await call<{ estimate: { fare: number } }>('POST', `/rides/${r.REQUEST_ID}/complete`, this.token, {});
          log(`${this.name} completes #${r.REQUEST_ID} · €${done.estimate?.fare}`);
          await this.sync();
        }
      }
    } catch (e) {
      log(`${this.name}: ${(e as Error).message}`);
      await this.sync();
    }
    this.socket.emit('driver:location', this.pos);
  }

  async stop() {
    await call('POST', '/driver/offline', this.token).catch(() => undefined);
    this.socket.close();
  }
}

class SimClient {
  rideId: number | null = null;
  since = 0;
  constructor(public name: string, public token: string) {}

  async tick() {
    try {
      if (this.rideId == null) {
        if (Math.random() > 0.08) return; // not everyone wants a ride right now
        const from = around(CENTER, 2.5);
        const to = around(CENTER, 3);
        const r = await call<{ ride: Ride; allocated: boolean }>('POST', '/rides', this.token, {
          originLat: from.lat, originLong: from.long, originAddress: 'Simulated pickup',
          destName: 'Simulated destination', destLat: to.lat, destLong: to.long,
          vehicleType: Math.random() < 0.3 ? 'AI' : 'NOAI',
        });
        this.rideId = r.ride.REQUEST_ID;
        this.since = Date.now();
        log(`${this.name} requests #${this.rideId}${r.allocated ? '' : ' (waiting for a driver)'}`);
        return;
      }
      const { ride } = await call<{ ride: Ride }>('GET', `/rides/${this.rideId}`, this.token);
      if (ride.STATUS === 'COMPLETED') {
        await call('POST', `/rides/${this.rideId}/rate`, this.token, { score: Math.round(rand(3, 5)) });
        this.rideId = null;
      } else if (ride.STATUS === 'CANCELLED') {
        this.rideId = null;
      } else if (ride.STATUS === 'REQUESTED' && Date.now() - this.since > 60000) {
        log(`${this.name} gives up on #${this.rideId}`);
        await call('POST', `/rides/${this.rideId}/cancel`, this.token);
        this.rideId = null;
      }
    } catch (e) {
      log(`${this.name}: ${(e as Error).message}`);
      this.rideId = null;
    }
  }

  /** Leave nothing waiting behind: cancel a ride that has not started. */
  async stop() {
    if (this.rideId == null) return;
    await call('POST', `/rides/${this.rideId}/cancel`, this.token).catch(() => undefined);
  }
}

async function main() {
  const admin = await login('admin@tvdept.pt', 'demo123');
  const { drivers } = await call<{ drivers: { NAME: string; EMAIL: string; STATUS: string }[] }>('GET', '/admin/drivers', admin);
  // Every driver already AVAILABLE must be driven (aloca_motorista may pick any
  // of them), topped up with offline ones up to SIM_DRIVERS.
  const available = drivers.filter((d) => d.STATUS === 'AVAILABLE');
  const offline = drivers.filter((d) => d.STATUS === 'OFFLINE');
  const pool = [...available, ...offline.slice(0, Math.max(0, N_DRIVERS - available.length))];

  const simDrivers: SimDriver[] = [];
  for (const d of pool) {
    const sd = new SimDriver(d.NAME, await login(d.EMAIL, 'demo123'));
    await sd.start();
    simDrivers.push(sd);
  }

  const simClients: SimClient[] = [];
  for (let i = 1; i <= N_CLIENTS; i++) {
    const email = `sim.client${i}@tvdept.sim`;
    const token = await login(email, 'demo123').catch(async () =>
      (await call('POST', '/auth/register', undefined, { role: 'CLIENT', email, password: 'demo123', name: `Sim Client ${i}` })).accessToken,
    );
    simClients.push(new SimClient(`Sim Client ${i}`, token));
  }
  log(`simulating ${simDrivers.length} drivers and ${simClients.length} clients against ${API} — Ctrl+C to stop`);

  let running = true;
  const stop = async () => {
    if (!running) return;
    running = false;
    log('stopping: cancelling open requests, taking drivers offline…');
    await Promise.all(simClients.map((c) => c.stop()));
    await Promise.all(simDrivers.map((d) => d.stop()));
    process.exit(0);
  };
  process.on('SIGINT', stop);
  if (SECONDS > 0) setTimeout(stop, SECONDS * 1000);

  while (running) {
    await Promise.all([...simDrivers.map((d) => d.tick()), ...simClients.map((c) => c.tick())]);
    await sleep(TICK_MS);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

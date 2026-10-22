// Shared helpers for the end-to-end tests. They run against a live stack
// (docker compose up) and only use the public HTTP API and the socket.
// Each suite works in its own city, far from the others and from the Coimbra
// demo traffic, so suites and the simulator never pick each other's drivers.
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

export const API = process.env.API_URL ?? 'http://localhost:3000';
export const run = Date.now() % 100000; // unique emails / plates per run

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const qs = (o) => '?' + new URLSearchParams(o).toString();

export async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

/** One named assertion, reported as its own subtest (failures don't stop the flow). */
export const check = (t, name, cond, detail = '') => t.test(name, () => assert.ok(cond, detail || name));

export async function login(email, password = 'demo123') {
  return (await call('POST', '/auth/login', null, { email, password })).body.accessToken;
}

export async function signupClient(tag, name = `Client ${tag}`) {
  const r = await call('POST', '/auth/register', null, {
    role: 'CLIENT', email: `c.${tag}.${run}@e2e.test`, password: 'secret1', name,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body.accessToken;
}

export async function signupDriver(tag, vehicle = {}, name = `Driver ${tag}`) {
  const r = await call('POST', '/auth/register', null, {
    role: 'DRIVER', email: `d.${tag}.${run}@e2e.test`, password: 'secret1', name,
    licenseNumber: `L-${tag}-${run}`,
    vehicle: { plate: `${tag}-${run}`.toUpperCase(), brand: 'Renault', model: 'Zoe', year: 2021, fuelType: 'Electric', vehicleType: 'NOAI', ...vehicle },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const token = r.body.accessToken;
  const id = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).driverId;
  return { token, id };
}

/** A connected socket that records every ride:updated / driver:moved. */
export function listen(token) {
  const socket = io(API, { auth: { token }, transports: ['websocket'] });
  const rides = [];
  const moves = [];
  socket.on('ride:updated', (p) => rides.push(p.ride));
  socket.on('driver:moved', (p) => moves.push(p));
  return new Promise((resolve) => socket.on('connect', () => resolve({ socket, rides, moves })));
}

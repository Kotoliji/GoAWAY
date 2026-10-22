import * as svc from './rides.service';
import { notifyRide } from '../../realtime/notify';

/** Run aloca_motorista. False when nobody is available (-20810): the request
 *  then simply stays REQUESTED until a driver frees up. */
export async function tryAllocate(requestId: number, radiusKm = 50): Promise<boolean> {
  try {
    await svc.allocate(requestId, radiusKm);
    return true;
  } catch (e: any) {
    if (e?.errorNum === 20810) return false;
    throw e;
  }
}

/** Offer every recent waiting request again — called when a driver comes
 *  online or releases requests. Each new assignment is pushed to both sides. */
export async function dispatchPending(): Promise<void> {
  for (const id of await svc.pendingRequestIds()) {
    if (await tryAllocate(id)) notifyRide(await svc.getRide(id));
  }
}

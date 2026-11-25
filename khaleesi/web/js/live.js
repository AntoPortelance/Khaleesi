/** Latest value of each sensor, as sent about 10 times per second by the server. */

// A value older than this is no longer trusted (NFR-06).
export const STALE_MS = 2000;
const HISTORY_MS = 60000;

export class LiveValues {
  constructor() {
    this.latest = new Map();
    this.history = new Map();
    this.simulated = false;
    this.lastBatchAt = 0;
  }

  /** Stores one sensor_readings event. Times are taken on arrival, with this browser's clock. */
  update(event) {
    const now = Date.now();
    this.simulated = Boolean(event.simulated);
    this.lastBatchAt = now;
    for (const reading of event.readings) {
      this.latest.set(reading.id, { ...reading, receivedAt: now, measuredAt: event.timestamp });
      if (typeof reading.value !== 'number') continue;
      let points = this.history.get(reading.id);
      if (!points) this.history.set(reading.id, (points = []));
      points.push([now, reading.value]);
      while (points.length && points[0][0] < now - HISTORY_MS) points.shift();
    }
  }

  /** Returns the reading to show, with `stale` set when it is too old, or null if none yet. */
  get(sensorId) {
    const reading = this.latest.get(sensorId);
    if (!reading) return null;
    return { ...reading, stale: Date.now() - reading.receivedAt > STALE_MS };
  }

  points(sensorId) {
    return this.history.get(sensorId) ?? [];
  }

  isReceiving() {
    return Date.now() - this.lastBatchAt <= STALE_MS;
  }

  forget(sensorId) {
    this.latest.delete(sensorId);
    this.history.delete(sensorId);
  }
}

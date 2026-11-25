/** Text shown for devices and values, in one place so every view says the same thing. */

export const KIND_LABELS = {
  valve: 'Valve',
  cylinder: 'Cylinder',
  analog: 'Analog',
  digital: 'Digital',
};

export const STATE_LABELS = {
  OPEN: 'Open',
  CLOSED: 'Closed',
  EXTENDED: 'Extended',
  RETRACTED: 'Retracted',
};

export const COMMAND_LABELS = {
  OPEN: 'Open',
  CLOSED: 'Close',
  EXTENDED: 'Extend',
  RETRACTED: 'Retract',
};

export const NO_VALUE = '—';

/** Value of a sensor with its unit, e.g. "18.42 bar", or "ON" for a digital input. */
export function formatValue(sensor, value) {
  if (typeof value !== 'number') return NO_VALUE;
  if (sensor.kind === 'digital') return value ? 'ON' : 'OFF';
  const text = value.toFixed(sensor.decimals ?? 2);
  return sensor.unit ? `${text} ${sensor.unit}` : text;
}

/**
 * How a reading should look: "ok", "alarm" (outside the range), "invalid", or "none"
 * (no reading yet, or none recently), with the label of the card's tag.
 */
export function describeReading(reading) {
  if (!reading) return { tone: 'none', tag: 'No data' };
  if (reading.stale) return { tone: 'none', tag: 'No recent data' };
  if (reading.status === 'low') return { tone: 'alarm', tag: 'Below range' };
  if (reading.status === 'high') return { tone: 'alarm', tag: 'Above range' };
  if (reading.status === 'invalid') return { tone: 'invalid', tag: 'Invalid value' };
  return { tone: 'ok', tag: '' };
}

export function formatRange(sensor) {
  const unit = sensor.unit ? ` ${sensor.unit}` : '';
  if (sensor.min !== null && sensor.max !== null) return `${sensor.min} to ${sensor.max}${unit}`;
  if (sensor.min !== null) return `Above ${sensor.min}${unit}`;
  if (sensor.max !== null) return `Below ${sensor.max}${unit}`;
  return 'Not set';
}

export function formatInput(device) {
  const number = device.pin ?? device.channel;
  if (number === null || number === undefined) return 'Not wired';
  return device.kind === 'analog' ? `ADC channel ${number}` : `GPIO ${number}`;
}

export function formatTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString() : '';
}

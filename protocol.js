export const SERVICE_UUID = 'a6e90001-7a25-4b48-9c6d-4f5b108a0001';
export const CHARACTERISTIC_UUID = 'a6e90002-7a25-4b48-9c6d-4f5b108a0001';
export const PACKET_SIZE = 124;
export const VERSION = 1;

export const fields = [
  'accE','accN','accU','linearE','linearN','linearU','gyroX','gyroY','gyroZ',
  'magX','magY','magZ','quatX','quatY','quatZ','quatW','pressure','temperature',
  'humidity','gas','iaq','eco2','bvoc','headingError','standardAltitude','bsecAccuracy'
];

export function decodeTelemetry(input) {
  const view = input instanceof DataView
    ? input
    : new DataView(input.buffer ?? input, input.byteOffset ?? 0, input.byteLength ?? input.byteLength);
  if (view.byteLength !== PACKET_SIZE) throw new Error(`Paketlänge ${view.byteLength} statt ${PACKET_SIZE} Byte`);
  if (view.getUint8(0) !== 0x45 || view.getUint8(1) !== 0x5a) throw new Error('Ungültige Paketkennung');
  if (view.getUint8(2) !== VERSION) throw new Error(`Protokollversion ${view.getUint8(2)} wird nicht unterstützt`);
  if (view.getUint8(3) !== PACKET_SIZE) throw new Error('Ungültige Längenangabe im Paket');
  const sample = {
    sequence: view.getUint32(4, true),
    millis: view.getUint32(8, true),
    present: view.getUint16(12, true),
    valid: view.getUint16(14, true),
    fresh: view.getUint16(16, true)
  };
  fields.forEach((field, index) => { sample[field] = view.getFloat32(20 + index * 4, true); });
  return sample;
}

export function altitudeFromPressure(pressureHpa, qnhHpa = 1013.25) {
  if (!(pressureHpa > 0) || !(qnhHpa > 0)) return NaN;
  return 44330 * (1 - Math.pow(pressureHpa / qnhHpa, 0.19029495));
}

export function sequenceGap(previous, current) {
  if (previous == null) return 0;
  const delta = (current - previous) >>> 0;
  return delta > 0 && delta < 0x80000000 ? Math.max(0, delta - 1) : 0;
}

export function groupValid(sample, bit) {
  return Boolean(sample.valid & (1 << bit));
}

export function samplesInWindow(samples, latestReceived, windowMs = 60000) {
  const cutoff = latestReceived - windowMs;
  return samples.filter(sample => sample.received >= cutoff && sample.received <= latestReceived);
}

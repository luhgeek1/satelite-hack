export const formatClock = (seconds: number) => {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600) % 24;
  const minutes = Math.floor(total / 60) % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const formatDuration = (seconds: number) => {
  if (seconds <= 0) return '0 min';
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
};

/** Waits, not outages. Outage lengths land on the scenario's step and read
 *  naturally in minutes; a search that finishes in seconds must not say 0 min. */
export const formatWait = (seconds: number) => {
  if (seconds < 1) return '< 1 s';
  if (seconds < 90) return `${Math.round(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min`;
  return `${(minutes / 60).toFixed(1)} h`;
};

export const formatPercent = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)}%`;

export const formatPoints = (delta: number, digits = 1) =>
  `${delta > 0 ? '+' : delta < 0 ? '−' : '±'}${Math.abs(delta * 100).toFixed(digits)} pp`;

export const formatDegrees = (value: number) => value.toFixed(1).padStart(5, '0');

export const formatLatitude = (lat: number) => `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}`;

export const formatLongitude = (lon: number) => `${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;

export const NO_ROUTE_COPY: Record<string, string> = {
  no_visible_satellite: 'No satellite in view',
  network_partition: 'Inter-satellite mesh is broken',
  no_gateway_contact: 'No satellite can reach the gateway',
  gateway_unavailable: 'Gateway is offline',
};

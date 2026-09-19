export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

// IANA zones the browser knows. The database validates against
// pg_timezone_names, which is a superset.
export function timeZoneOptions(current?: string): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  const set = new Set(zones);
  set.add('UTC');
  if (current) set.add(current);
  return [...set].sort((a, b) => a.localeCompare(b));
}

export function timeZoneLabel(zone: string): string {
  return zone.replace(/_/g, ' ').replace(/\//g, ' / ');
}

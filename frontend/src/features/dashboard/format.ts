/** "5m ago", "3h ago", "2d ago". Falls back to a date for anything older than a month. */
export function formatRelative(iso: string, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  if (!Number.isFinite(diffMs)) return "unknown";
  const seconds = Math.max(0, Math.round(diffMs / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Hours as "42 min", "5.2 h" or "3.4 d". */
export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1)} h`;
  return `${(hours / 24).toFixed(1)} d`;
}

export function formatClock(iso: string | number): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

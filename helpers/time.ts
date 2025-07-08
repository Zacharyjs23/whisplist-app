export function formatTimeLeft(end: Date): string {
  const diff = end.getTime() - Date.now();
  if (diff <= 0) {
    return '';
  }
  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hrs}h ${mins}m left`;
}

/** The driver's own local wall-clock reading, as the naive
 * "YYYY-MM-DDTHH:MM:SS" the backend expects — built from `Date`'s local
 * getters (not `toISOString()`, which is UTC) so a driver in any timezone
 * gets a trip anchored to their own clock, not the server's. */
export function formatLocalDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  const year = date.getFullYear()
  const month = pad(date.getMonth() + 1)
  const day = pad(date.getDate())
  const hours = pad(date.getHours())
  const minutes = pad(date.getMinutes())
  const seconds = pad(date.getSeconds())
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
}

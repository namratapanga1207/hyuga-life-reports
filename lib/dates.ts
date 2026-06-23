export function enumerateDays(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  const [ey, em, ed] = endDate.split("-").map(Number);
  const endKey = `${ey}-${String(em).padStart(2, "0")}-${String(ed).padStart(2, "0")}`;
  let [y, m, d] = startDate.split("-").map(Number);
  while (true) {
    const key = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push(key);
    if (key === endKey) break;
    const next = new Date(y, m - 1, d + 1);
    y = next.getFullYear();
    m = next.getMonth() + 1;
    d = next.getDate();
  }
  return days;
}

export function daysInclusive(startDate: string, endDate: string): number {
  return enumerateDays(startDate, endDate).length;
}

export function monthNameFromDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00`);
  return d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
}

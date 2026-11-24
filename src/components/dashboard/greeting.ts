/** "Good morning" before noon, "Good afternoon" before six, then "Good evening", in the workspace's time zone. */
export function greeting(now: Date, timeZone: string): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

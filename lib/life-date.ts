export const APP_TIME_ZONE = "Asia/Shanghai";
export const DAY_BOUNDARY_HOUR = 4;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export function getLifeDate(epochMs = Date.now()): string {
  const values = Object.fromEntries(
    dateTimeFormatter
      .formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const localClockAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );
  return new Date(localClockAsUtc - DAY_BOUNDARY_HOUR * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function lifeDayBounds(lifeDate: string): { start: number; end: number } {
  const [year, month, day] = lifeDate.split("-").map(Number);
  const start =
    Date.UTC(year, month - 1, day, DAY_BOUNDARY_HOUR, 0, 0, 0) -
    SHANGHAI_OFFSET_MS;
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

export function localInputToEpoch(value: string): number {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error("日期时间格式不正确");
  const [, y, m, d, h, minute] = match.map(Number);
  return Date.UTC(y, m - 1, d, h, minute) - SHANGHAI_OFFSET_MS;
}

export function epochToLocalInput(epochMs: number): string {
  const parts = Object.fromEntries(
    dateTimeFormatter
      .formatToParts(new Date(epochMs))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function weekBounds(date: string): { start: string; end: string } {
  const [year, month, day] = date.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const weekday = current.getUTCDay() || 7;
  const start = addDays(date, 1 - weekday);
  return { start, end: addDays(start, 7) };
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h${String(minutes).padStart(2, "0")}m`;
}

export function formatRemainingDuration(totalSeconds: number): string {
  const roundedUpToMinute = Math.ceil(Math.max(0, totalSeconds) / 60) * 60;
  return formatDuration(roundedUpToMinute);
}

export function formatClock(epochMs: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(epochMs);
}

export function displayDate(date: string): {
  monthDay: string;
  full: string;
  weekday: string;
} {
  const { start } = lifeDayBounds(date);
  const noon = start + 8 * 60 * 60 * 1000;
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).formatToParts(noon);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    monthDay: `${date.slice(5, 7)}.${date.slice(8, 10)}`,
    full: `${values.year}年${Number(values.month)}月${Number(values.day)}日`,
    weekday: values.weekday,
  };
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.floor((b - a) / 86_400_000);
}

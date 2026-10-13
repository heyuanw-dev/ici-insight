import { siteConfig } from "@/lib/config";

export function vancouverToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: siteConfig.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

// Calendar arithmetic on date-only values; never add hours to a Vancouver instant.
export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function calendarWeek(date: string): { start: string; end: string } {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const start = addCalendarDays(date, -((weekday + 6) % 7));
  // Keep the HTML date input inside the application's supported year range.
  const end = addCalendarDays(start, 6);
  return { start, end: end.startsWith("+") ? "9999-12-31" : end };
}

export function formatPresentationDate(date: string, short = false): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    weekday: short ? undefined : "long",
    month: short ? "short" : "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00Z`));
}

export function schedulePageForDate(date: string, today: string): number {
  const days =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) /
    86_400_000;
  return Math.max(0, Math.floor(days / (siteConfig.defaultScheduleWeeks * 7)));
}

export function scheduleWindow(
  today: string,
  requestedPage: unknown,
  latestDate: string | null,
) {
  const maxPage = latestDate ? schedulePageForDate(latestDate, today) : 0;
  const requested =
    typeof requestedPage === "string" && /^\d{1,6}$/.test(requestedPage)
      ? Number(requestedPage)
      : 0;
  const page = Math.min(requested, maxPage);
  const start = addCalendarDays(
    today,
    page * siteConfig.defaultScheduleWeeks * 7,
  );
  return {
    page,
    start,
    end: addCalendarDays(start, siteConfig.defaultScheduleWeeks * 7),
    hasNext: page < maxPage,
  };
}

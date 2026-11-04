import { isoWeek } from "./calendarization-model";
import { operationClosesAt, operationDate } from "./model";

export type CalendarizationCountdown = {
  week: number;
  year: number;
  startDate: string;
  endDate: string;
  startsAt: number;
  endsAt: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

function shiftDate(date: string, days: number) {
  const value = new Date(date + "T12:00:00Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

// The active calendar week is Monday–Sunday in Brasília, independently of
// the visitor's timezone or the operation date selected in a form.
export function calendarizationCountdown(now: number, previous?: CalendarizationCountdown): CalendarizationCountdown {
  let period = previous;
  if (!period || now < period.startsAt || now >= period.endsAt) {
    const date = operationDate(new Date(now));
    const weekday = (new Date(date + "T12:00:00Z").getUTCDay() + 6) % 7;
    const startDate = shiftDate(date, -weekday);
    const endDate = shiftDate(startDate, 6);
    period = {
      ...isoWeek(date), startDate, endDate,
      startsAt: Date.parse(operationClosesAt(shiftDate(startDate, -1))),
      endsAt: Date.parse(operationClosesAt(endDate)),
      days: 0, hours: 0, minutes: 0, seconds: 0,
    };
  }
  // Recompute from the clock on every tick, including after a suspended tab.
  const remaining = Math.max(0, Math.ceil((period.endsAt - now) / 1000));
  return {
    ...period,
    days: Math.floor(remaining / 86400),
    hours: Math.floor(remaining / 3600) % 24,
    minutes: Math.floor(remaining / 60) % 60,
    seconds: remaining % 60,
  };
}

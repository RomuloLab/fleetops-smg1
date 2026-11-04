"use client";

import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { calendarizationCountdown, type CalendarizationCountdown } from "@/lib/calendarization-countdown";
import { formatDate } from "@/lib/model";

const twoDigits = (value: number) => String(value).padStart(2, "0");

export default function CalendarizationWeekTimer() {
  const [countdown, setCountdown] = useState<CalendarizationCountdown | null>(null);

  useEffect(() => {
    let current: CalendarizationCountdown | undefined;
    const update = () => {
      current = calendarizationCountdown(Date.now(), current);
      setCountdown(current);
    };
    const onVisible = () => { if (!document.hidden) update(); };
    update();
    const interval = window.setInterval(update, 1000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", update);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", update);
    };
  }, []);

  const description = countdown
    ? `Calendarização da semana ${countdown.week}/${countdown.year}, de ${formatDate(countdown.startDate)} a ${formatDate(countdown.endDate)}. Encerra à meia-noite de domingo para segunda, no horário de Brasília.`
    : "Calendarização semanal · Horário de Brasília";

  return <div className="calendar-week-timer" role="timer" aria-live="off" aria-label={countdown
    ? `Calendarização, semana ${countdown.week} de ${countdown.year}. Restam ${countdown.days} dias, ${countdown.hours} horas, ${countdown.minutes} minutos e ${countdown.seconds} segundos.`
    : "Carregando contador da calendarização"} title={description}>
    <Timer size={16} aria-hidden="true"/>
    <span className="calendar-week-caption" aria-hidden="true"><strong>{countdown ? `W${countdown.week}` : "W—"}</strong> encerra em</span>
    <span className="calendar-week-digits" aria-hidden="true">{countdown
      ? <><b>{twoDigits(countdown.days)}</b><small>d</small> <b>{twoDigits(countdown.hours)}</b><small>h</small> <b>{twoDigits(countdown.minutes)}</b><small>m</small> <b>{twoDigits(countdown.seconds)}</b><small>s</small></>
      : <>--<small>d</small> --<small>h</small> --<small>m</small> --<small>s</small></>}
    </span>
  </div>;
}

export const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
] as const;

export type CycleMode = "calendar" | "payday";

export type YearMonth = {
  year: number;
  month: number;
};

const PAYDAY_START_DAY = 25;

export function jakartaNowParts(): YearMonth & { day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value ?? "2026"),
    month: Number(parts.find((part) => part.type === "month")?.value ?? "01"),
    day: Number(parts.find((part) => part.type === "day")?.value ?? "01"),
  };
}

export function parseCycle(value?: string): CycleMode {
  return value === "payday" ? "payday" : "calendar";
}

export function parseYearMonth(value: string | undefined, cycle: CycleMode): YearMonth {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    if (month >= 1 && month <= 12) {
      return { year, month };
    }
  }

  const now = jakartaNowParts();
  if (cycle === "payday" && now.day >= PAYDAY_START_DAY) {
    return addMonths(now, 1);
  }
  return { year: now.year, month: now.month };
}

export function formatYearMonth({ year, month }: YearMonth): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function monthLabel({ year, month }: YearMonth): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return {
    year: Math.floor(index / 12),
    month: (index % 12) + 1,
  };
}

export function periodRange(selected: YearMonth, cycle: CycleMode): {
  start: string;
  end: string;
  hint: string;
} {
  if (cycle === "calendar") {
    const next = addMonths(selected, 1);
    return {
      start: `${formatYearMonth(selected)}-01T00:00:00+07:00`,
      end: `${formatYearMonth(next)}-01T00:00:00+07:00`,
      hint: `1–${lastDayLabel(selected)} ${MONTH_NAMES[selected.month - 1]}`,
    };
  }

  const previous = addMonths(selected, -1);
  return {
    start: `${formatYearMonth(previous)}-${PAYDAY_START_DAY}T00:00:00+07:00`,
    end: `${formatYearMonth(selected)}-${PAYDAY_START_DAY}T00:00:00+07:00`,
    hint: `25 ${MONTH_NAMES[previous.month - 1]} – 24 ${MONTH_NAMES[selected.month - 1]}`,
  };
}

export function monthOptions(around: YearMonth, past = 12, future = 3): YearMonth[] {
  const options: YearMonth[] = [];
  for (let i = -past; i <= future; i += 1) {
    options.push(addMonths(around, i));
  }
  return options;
}

function lastDayLabel(selected: YearMonth): number {
  const next = addMonths(selected, 1);
  const last = new Date(Date.UTC(next.year, next.month - 1, 0));
  return last.getUTCDate();
}

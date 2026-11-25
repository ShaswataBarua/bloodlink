export function groupLabel(group: string): string {
  return group.replace("_POS", "+").replace("_NEG", "\u2212");
}

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka",
});
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  timeZone: "Asia/Dhaka", hour12: false,
});

export function fmtDate(value: Date | string): string {
  return DATE.format(new Date(value));
}

export function fmtDateTime(value: Date | string): string {
  return DATE_TIME.format(new Date(value));
}

/** Negative means already expired. */
export function daysUntil(value: Date | string): number {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000);
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

import { daysInclusive } from "./dates";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REPORT_DAYS = 31;

export type ReportParams = {
  startDate: string;
  endDate: string;
  accountId: number;
};

export function parseReportParams(
  startDate: string | null,
  endDate: string | null,
  accountIdRaw?: string | null,
): ReportParams | { error: string } {
  if (!startDate || !endDate) {
    return { error: "start_date and end_date are required (YYYY-MM-DD)" };
  }
  if (!DATE_RE.test(startDate) || !DATE_RE.test(endDate)) {
    return { error: "Dates must be YYYY-MM-DD" };
  }
  if (startDate > endDate) {
    return { error: "start_date must be on or before end_date" };
  }

  const span = daysInclusive(startDate, endDate);
  if (span > MAX_REPORT_DAYS) {
    return {
      error: `Date range is ${span} days. Maximum allowed is ${MAX_REPORT_DAYS} days (1 month).`,
    };
  }

  const accountId = accountIdRaw
    ? Number(accountIdRaw)
    : Number(process.env.HYUGA_ACCOUNT_ID ?? "28052");

  if (!Number.isInteger(accountId) || accountId <= 0) {
    return { error: "account_id must be a positive integer" };
  }

  return { startDate, endDate, accountId };
}

export function sqlLiteralDate(date: string): string {
  if (!DATE_RE.test(date)) throw new Error("Invalid date");
  return date;
}

export function sqlUInt64(n: number): string {
  if (!Number.isInteger(n) || n <= 0) throw new Error("Invalid account id");
  return String(n);
}

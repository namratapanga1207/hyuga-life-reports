import { readFileSync } from "fs";
import { join } from "path";

export const SUMMARY_SQL = readFileSync(
  join(process.cwd(), "sql/nutritionist_ticket_summary.sql"),
  "utf8",
);

export const TICKET_DUMP_SQL = readFileSync(
  join(process.cwd(), "sql/nutritionist_ticket_dump.sql"),
  "utf8",
);

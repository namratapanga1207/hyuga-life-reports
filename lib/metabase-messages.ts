import { readFileSync } from "fs";
import { join } from "path";
import type { ReportParams } from "./params";
import { enumerateDays } from "./dates";
import { runMetabaseSql } from "./metabase";

export const MESSAGE_CONTENT_CARD_ID = 2902;

export type MessageRow = {
  message_id: unknown;
  created_at_content: string;
  conversation_id: number;
  contact_id: unknown;
  agent_id: unknown;
  agent_name: string;
  inbox_id: unknown;
  template_id: unknown;
  display_id: number;
  incoming_or_outcoming: string;
  contact_name: string;
  phone_number: string;
  email: string;
  message_content: string;
  sender_type: string;
};

const CARD_2902_SQL = readFileSync(
  join(process.cwd(), "sql", "metabase_card_2902.sql"),
  "utf8",
);

function asMessageRows(rows: Record<string, unknown>[]): MessageRow[] {
  return rows as MessageRow[];
}

async function fetchDay(
  day: string,
  accountId: number,
): Promise<MessageRow[]> {
  const params: ReportParams = {
    startDate: day,
    endDate: day,
    accountId,
  };
  const rows = await runMetabaseSql(CARD_2902_SQL, params);
  return asMessageRows(rows);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}

/**
 * Full message dump from Metabase card 2902.
 * Uses /api/dataset (not /api/card/.../query) to avoid Metabase's 2k row cap on card queries.
 * Fetches day-by-day so large months are not truncated at max-results.
 */
export async function fetchMessageContent(
  params: ReportParams,
): Promise<MessageRow[]> {
  const days = enumerateDays(params.startDate, params.endDate);
  const chunks = await mapWithConcurrency(days, 4, (day) =>
    fetchDay(day, params.accountId),
  );
  return chunks.flat();
}

export { metabaseConfigured } from "./metabase";

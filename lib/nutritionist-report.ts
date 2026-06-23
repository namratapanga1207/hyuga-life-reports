import type { ReportParams } from "./params";
import { monthNameFromDate } from "./dates";
import type { MessageRow } from "./metabase-messages";
import { runMetabaseSql } from "./metabase";

export type SummaryRow = {
  month: string;
  chat_with_nutritionist_clicks: number;
  entry_point_1: number;
  entry_point_2: number;
};

export type TicketRow = {
  phone_number: string;
  ticket_link: string;
  inbox: string;
  first_message: string;
  entry_type: string;
  ticket_id: number;
  level_1_tags: string;
  level_2_tags: string;
  level_3_tags: string;
  system_tags: string;
};

const NUTRI_PHRASE = "chat with nutritionist";

function containsNutritionistClick(content: string): boolean {
  return content.toLowerCase().includes(NUTRI_PHRASE);
}

function isSummaryEntryPoint1(content: string): boolean {
  const text = content.trim();
  return (
    [...text].length === 70 &&
    text
      .toLowerCase()
      .includes(
        "looking for nutritionist advice for my health & wellness needs",
      )
  );
}

function isSummaryEntryPoint2(content: string): boolean {
  const text = content.trim();
  return (
    text.startsWith("Hi, I need help with") &&
    text.toLowerCase().includes("hyugalife.com/product") &&
    !text.includes("\n")
  );
}

function ticketEntryType(
  content: string,
): "Entry Point 1" | "Entry Point 2" | "Other" {
  if (isSummaryEntryPoint1(content)) return "Entry Point 1";
  if (isSummaryEntryPoint2(content)) return "Entry Point 2";
  return "Other";
}

function monthFromTimestamp(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleString("en-US", { month: "long", timeZone: "Asia/Kolkata" });
}

function ticketLink(accountId: number, displayId: number): string {
  return `https://app.limechat.ai/app/accounts/${accountId}/conversations/${displayId}`;
}

type ClickRow = MessageRow & { rowIndex: number };
type IncomingRow = MessageRow & { rowIndex: number };

export function buildSummaryFromMessages(
  messages: MessageRow[],
  params: ReportParams,
): SummaryRow[] {
  const dated = messages
    .map((m, rowIndex) => ({ ...m, rowIndex }))
    .filter((m) => m.created_at_content);

  const nutriConvIds = new Set(
    dated
      .filter((m) => containsNutritionistClick(String(m.message_content ?? "")))
      .map((m) => m.conversation_id),
  );

  const convMessages = dated
    .filter((m) => nutriConvIds.has(m.conversation_id))
    .sort((a, b) => {
      const t = String(a.created_at_content).localeCompare(String(b.created_at_content));
      return t !== 0 ? t : a.rowIndex - b.rowIndex;
    });

  const firstIncomingByConv = new Map<number, string>();
  for (const m of convMessages) {
    if (m.incoming_or_outcoming !== "Incoming") continue;
    if (containsNutritionistClick(String(m.message_content ?? ""))) continue;
    if (!firstIncomingByConv.has(m.conversation_id)) {
      firstIncomingByConv.set(m.conversation_id, String(m.message_content ?? ""));
    }
  }

  const clicksByConv = new Map<number, ClickRow>();
  for (const m of convMessages) {
    if (!containsNutritionistClick(String(m.message_content ?? ""))) continue;
    if (!clicksByConv.has(m.conversation_id)) {
      clicksByConv.set(m.conversation_id, m);
    }
  }

  const monthBuckets = new Map<
    string,
    { clicks: number; ep1: number; ep2: number }
  >();

  for (const click of clicksByConv.values()) {
    const month = monthFromTimestamp(String(click.created_at_content));
    const bucket = monthBuckets.get(month) ?? { clicks: 0, ep1: 0, ep2: 0 };
    bucket.clicks += 1;
    const firstMsg = firstIncomingByConv.get(click.conversation_id) ?? "";
    if (isSummaryEntryPoint1(firstMsg)) bucket.ep1 += 1;
    if (isSummaryEntryPoint2(firstMsg)) bucket.ep2 += 1;
    monthBuckets.set(month, bucket);
  }

  const monthOrder = enumerateMonths(params.startDate, params.endDate);
  return monthOrder.map((month) => {
    const b = monthBuckets.get(month) ?? { clicks: 0, ep1: 0, ep2: 0 };
    return {
      month,
      chat_with_nutritionist_clicks: b.clicks,
      entry_point_1: b.ep1,
      entry_point_2: b.ep2,
    };
  });
}

export function buildTicketDumpFromMessages(
  messages: MessageRow[],
  params: ReportParams,
): Omit<TicketRow, "level_1_tags" | "level_2_tags" | "level_3_tags" | "system_tags">[] {
  const dated = messages
    .map((m, rowIndex) => ({ ...m, rowIndex }))
    .filter((m) => m.created_at_content);

  const nutriConvIds = new Set(
    dated
      .filter((m) => containsNutritionistClick(String(m.message_content ?? "")))
      .map((m) => m.conversation_id),
  );

  const convMessages = dated
    .filter((m) => nutriConvIds.has(m.conversation_id))
    .sort((a, b) => {
      const t = String(a.created_at_content).localeCompare(String(b.created_at_content));
      return t !== 0 ? t : a.rowIndex - b.rowIndex;
    });

  const firstIncomingByConv = new Map<number, IncomingRow>();
  for (const m of convMessages) {
    if (m.incoming_or_outcoming !== "Incoming") continue;
    if (containsNutritionistClick(String(m.message_content ?? ""))) continue;
    if (!firstIncomingByConv.has(m.conversation_id)) {
      firstIncomingByConv.set(m.conversation_id, m);
    }
  }

  const clicksByConv = new Map<number, ClickRow>();
  for (const m of convMessages) {
    if (!containsNutritionistClick(String(m.message_content ?? ""))) continue;
    if (!clicksByConv.has(m.conversation_id)) {
      clicksByConv.set(m.conversation_id, m);
    }
  }

  const rows: Omit<
    TicketRow,
    "level_1_tags" | "level_2_tags" | "level_3_tags" | "system_tags"
  >[] = [];

  for (const click of clicksByConv.values()) {
    const incoming = firstIncomingByConv.get(click.conversation_id);
    const firstMessage = incoming ? String(incoming.message_content ?? "") : "";
    const entryType = ticketEntryType(firstMessage);
    if (entryType === "Other") continue;

    const displayId = Number(click.display_id);
    if (!Number.isFinite(displayId)) continue;

    rows.push({
      phone_number: String(click.phone_number ?? ""),
      ticket_link: ticketLink(params.accountId, displayId),
      inbox: "",
      first_message: firstMessage,
      entry_type: entryType,
      ticket_id: displayId,
    });
  }

  rows.sort((a, b) => a.ticket_id - b.ticket_id);
  return rows;
}

function enumerateMonths(startDate: string, endDate: string): string[] {
  const months: string[] = [];
  const [sy, sm] = startDate.split("-").map(Number);
  const [ey, em] = endDate.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    const mid = `${y}-${String(m).padStart(2, "0")}-15`;
    months.push(monthNameFromDate(mid));
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
}

export async function attachTicketLabels(
  tickets: Omit<TicketRow, "level_1_tags" | "level_2_tags" | "level_3_tags" | "system_tags">[],
  params: ReportParams,
): Promise<TicketRow[]> {
  if (!tickets.length) return [];

  const ids = tickets.map((t) => t.ticket_id).join(",");
  const sql = `
SELECT
    display_id AS ticket_id,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(label_ids, id), l1.titles, l1.ids)),
        ', '
    ) AS level_1_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(label_ids, id), l2.titles, l2.ids)),
        ', '
    ) AS level_2_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(label_ids, id), l3.titles, l3.ids)),
        ', '
    ) AS level_3_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(label_ids, id), sl.titles, sl.ids)),
        ', '
    ) AS system_tags
FROM (
    SELECT display_id, argMax(label_ids, created_at) AS label_ids
    FROM default.dim_conversation_overview
    WHERE account_id = {{account_id}}
      AND display_id IN (${ids})
    GROUP BY display_id
) AS tk
CROSS JOIN (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = {{account_id}} AND label_type = 'client' AND label_level = 0
) AS l1
CROSS JOIN (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = {{account_id}} AND label_type = 'client' AND label_level = 1
) AS l2
CROSS JOIN (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = {{account_id}} AND label_type = 'client' AND label_level = 2
) AS l3
CROSS JOIN (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = {{account_id}} AND label_type = 'system'
) AS sl`;

  const labelRows = (await runMetabaseSql(sql, params)) as Array<{
    ticket_id: number;
    level_1_tags: string;
    level_2_tags: string;
    level_3_tags: string;
    system_tags: string;
  }>;

  const byId = new Map(labelRows.map((r) => [Number(r.ticket_id), r]));

  return tickets.map((t) => {
    const labels = byId.get(t.ticket_id);
    return {
      ...t,
      level_1_tags: labels?.level_1_tags ?? "",
      level_2_tags: labels?.level_2_tags ?? "",
      level_3_tags: labels?.level_3_tags ?? "",
      system_tags: labels?.system_tags ?? "",
    };
  });
}

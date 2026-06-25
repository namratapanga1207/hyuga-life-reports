import { readFileSync, writeFileSync } from "fs";
import { fetchMessageContent } from "../lib/metabase-messages";
import {
  buildSummaryFromMessages,
  buildTicketDumpFromMessages,
} from "../lib/nutritionist-report";
import { runMetabaseSql } from "../lib/metabase";
import { TICKET_DUMP_SQL } from "../lib/queries";

const params = {
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  accountId: 28052,
};

function parseCsvIds(path: string): Set<number> {
  const text = readFileSync(path, "utf8");
  const ids = new Set<number>();
  for (const line of text.trim().split("\n").slice(1)) {
    const cols: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);
    ids.add(Number(cols[5]));
  }
  return ids;
}

async function main() {
  const csvIds = parseCsvIds(
    "/Users/namratapanga/Downloads/nutritionist_report.xlsx - January.csv",
  );

  console.log("Fetching card 2902 messages...");
  const messages = await fetchMessageContent(params);
  const summary = buildSummaryFromMessages(messages, params);
  const tickets = buildTicketDumpFromMessages(messages, params);
  const ourIds = new Set(tickets.map((t) => t.ticket_id));
  const extras = tickets.filter((t) => !csvIds.has(t.ticket_id));

  console.log("\n=== CARD 2902 (current code) ===");
  console.log("summary:", summary[0]);
  console.log(
    "tickets:",
    tickets.length,
    "EP1:",
    tickets.filter((t) => t.entry_type === "Entry Point 1").length,
    "EP2:",
    tickets.filter((t) => t.entry_type === "Entry Point 2").length,
  );

  console.log("\n=== ID DIFF vs CSV (391) ===");
  console.log("inBoth:", [...csvIds].filter((id) => ourIds.has(id)).length);
  console.log("onlyCsv:", [...csvIds].filter((id) => !ourIds.has(id)).length);
  console.log("onlyOurs (extras):", extras.length);
  console.log(
    "extra EP1:",
    extras.filter((t) => t.entry_type === "Entry Point 1").length,
  );
  console.log(
    "extra EP2:",
    extras.filter((t) => t.entry_type === "Entry Point 2").length,
  );

  console.log("\n=== SQL ticket dump (old sheet logic) ===");
  const sqlTickets = (await runMetabaseSql(TICKET_DUMP_SQL, params)) as Array<{
    ticket_id: number;
    entry_type: string;
  }>;
  const sqlIds = new Set(sqlTickets.map((r) => Number(r.ticket_id)));
  console.log("sql tickets:", sqlTickets.length);
  console.log(
    "sql EP1:",
    sqlTickets.filter((r) => r.entry_type === "Entry Point 1").length,
    "EP2:",
    sqlTickets.filter((r) => r.entry_type === "Entry Point 2").length,
  );
  console.log("sql vs csv missing:", [...csvIds].filter((id) => !sqlIds.has(id)).length);
  console.log("card vs sql extra:", [...ourIds].filter((id) => !sqlIds.has(id)).length);

  // Click dates for extras
  const dated = messages.filter((m) => m.created_at_content);
  const extraClickDays: Record<string, number> = {};
  for (const t of extras) {
    const clickRows = dated.filter(
      (m) =>
        Number(m.display_id) === t.ticket_id &&
        String(m.message_content ?? "")
          .toLowerCase()
          .includes("chat with nutritionist"),
    );
    const day = String(clickRows[0]?.created_at_content ?? "unknown").slice(0, 10);
    extraClickDays[day] = (extraClickDays[day] ?? 0) + 1;
  }
  console.log("\n=== Extra ticket click dates (top 10) ===");
  console.log(
    Object.entries(extraClickDays)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10),
  );

  // EP1 char lengths in extras
  const ep1Lens: Record<number, number> = {};
  for (const t of extras.filter((t) => t.entry_type === "Entry Point 1")) {
    const len = [...t.first_message.trim()].length;
    ep1Lens[len] = (ep1Lens[len] ?? 0) + 1;
  }
  console.log("\n=== Extra EP1 first-message char lengths ===");
  console.log(ep1Lens);

  // Loose EP1 in summary but strict ticket excluded
  function looseEP1(c: string) {
    return c.includes("looking for Nutritionist advice");
  }
  function strictEP1(c: string) {
    const text = c.trim();
    return (
      [...text].length === 70 &&
      text
        .toLowerCase()
        .includes(
          "looking for nutritionist advice for my health & wellness needs",
        )
    );
  }

  const nutriConvIds = new Set(
    dated
      .filter((m) =>
        String(m.message_content ?? "")
          .toLowerCase()
          .includes("chat with nutritionist"),
      )
      .map((m) => m.conversation_id),
  );
  const convMsgs = dated
    .filter((m) => nutriConvIds.has(m.conversation_id))
    .sort((a, b) =>
      String(a.created_at_content).localeCompare(String(b.created_at_content)),
    );
  const firstIncoming = new Map<number, string>();
  for (const m of convMsgs) {
    if (m.incoming_or_outcoming !== "Incoming") continue;
    if (
      String(m.message_content ?? "")
        .toLowerCase()
        .includes("chat with nutritionist")
    )
      continue;
    if (!firstIncoming.has(m.conversation_id))
      firstIncoming.set(m.conversation_id, String(m.message_content ?? ""));
  }

  let looseNotStrict = 0;
  const looseSamples: string[] = [];
  for (const cid of nutriConvIds) {
    const msg = firstIncoming.get(cid) ?? "";
    if (looseEP1(msg) && !strictEP1(msg)) {
      looseNotStrict++;
      if (looseSamples.length < 5) looseSamples.push(msg.slice(0, 80));
    }
  }
  console.log("\n=== Summary-only loose EP1 (not strict 70-char) ===");
  console.log("count:", looseNotStrict);
  console.log("samples:", looseSamples);

  writeFileSync(
    "/tmp/jan_extras_sample.json",
    JSON.stringify(extras.slice(0, 20), null, 2),
  );
  console.log("\nWrote /tmp/jan_extras_sample.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

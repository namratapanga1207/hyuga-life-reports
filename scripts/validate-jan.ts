import { readFileSync } from "fs";
import { fetchMessageContent } from "../lib/metabase-messages";
import {
  buildSummaryFromMessages,
  buildTicketDumpFromMessages,
} from "../lib/nutritionist-report";

async function main() {
  const params = {
    startDate: "2026-01-01",
    endDate: "2026-01-31",
    accountId: 28052,
  };

  console.log("Fetching messages...");
  const messages = await fetchMessageContent(params);
  console.log("message_count:", messages.length);

  const summary = buildSummaryFromMessages(messages, params);
  console.log("summary:", summary);

  const tickets = buildTicketDumpFromMessages(messages, params);
  console.log("ticket_count:", tickets.length);
  const ep1 = tickets.filter((t) => t.entry_type === "Entry Point 1").length;
  const ep2 = tickets.filter((t) => t.entry_type === "Entry Point 2").length;
  console.log("ep1:", ep1, "ep2:", ep2);

  const text = readFileSync(
    "/Users/namratapanga/Downloads/nutritionist_report.xlsx - January.csv",
    "utf8",
  );
  const csvIds = new Set<number>();
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
    csvIds.add(Number(cols[5]));
  }

  const ourIds = new Set(tickets.map((t) => t.ticket_id));
  let inBoth = 0;
  let onlyCsv = 0;
  let onlyOurs = 0;
  for (const id of csvIds) {
    if (ourIds.has(id)) inBoth++;
    else onlyCsv++;
  }
  for (const id of ourIds) {
    if (!csvIds.has(id)) onlyOurs++;
  }
  console.log("csv:", csvIds.size, "ours:", ourIds.size);
  console.log("inBoth:", inBoth, "onlyCsv:", onlyCsv, "onlyOurs:", onlyOurs);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

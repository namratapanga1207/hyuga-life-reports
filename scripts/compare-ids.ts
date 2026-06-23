import { readFileSync, writeFileSync } from "fs";
import { runMetabaseSql } from "../lib/metabase";
import { TICKET_DUMP_SQL } from "../lib/queries";
import {
  buildTicketDumpFromMessages,
  buildSummaryFromMessages,
} from "../lib/nutritionist-report";
import { fetchMessageContent } from "../lib/metabase-messages";

const params = {
  startDate: "2026-01-01",
  endDate: "2026-01-31",
  accountId: 28052,
};

async function main() {
  const sqlTickets = await runMetabaseSql(TICKET_DUMP_SQL, params);
  writeFileSync(
    "/tmp/sql_tickets.json",
    JSON.stringify(sqlTickets.map((r) => r.ticket_id)),
  );
  console.log("sql count", sqlTickets.length);

  const messages = await fetchMessageContent(params);
  const loose = buildTicketDumpFromMessages(messages, params);
  writeFileSync(
    "/tmp/card_loose.json",
    JSON.stringify(loose.map((r) => r.ticket_id)),
  );
  console.log("card loose", loose.length);

  const summary = buildSummaryFromMessages(messages, params);
  console.log("card summary loose", summary);
}

main().catch(console.error);

import { NextRequest, NextResponse } from "next/server";
import { fetchMessageContent } from "@/lib/metabase-messages";
import {
  attachTicketLabels,
  buildSummaryFromMessages,
  buildTicketDumpFromMessages,
} from "@/lib/nutritionist-report";
import { parseReportParams } from "@/lib/params";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = parseReportParams(
    sp.get("start_date"),
    sp.get("end_date"),
    sp.get("account_id"),
  );

  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const messages = await fetchMessageContent(parsed);
    const summary = buildSummaryFromMessages(messages, parsed);
    const base = buildTicketDumpFromMessages(messages, parsed);
    const tickets = await attachTicketLabels(base, parsed);

    return NextResponse.json({
      params: parsed,
      message_count: messages.length,
      summary,
      tickets,
      count: tickets.length,
      total: {
        chat_with_nutritionist_clicks: summary.reduce(
          (s, r) => s + Number(r.chat_with_nutritionist_clicks),
          0,
        ),
        entry_point_1: summary.reduce((s, r) => s + Number(r.entry_point_1), 0),
        entry_point_2: summary.reduce((s, r) => s + Number(r.entry_point_2), 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

import { NextRequest } from "next/server";
import { fetchMessageContent } from "@/lib/metabase-messages";
import {
  attachTicketLabels,
  buildSummaryFromMessages,
  buildTicketDumpFromMessages,
  type SummaryRow,
  type TicketRow,
} from "@/lib/nutritionist-report";
import type { ReportParams } from "@/lib/params";
import { parseReportParams } from "@/lib/params";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type StreamEvent =
  | { type: "progress"; phase: "fetch" | "process"; done?: number; total?: number }
  | {
      type: "result";
      params: ReportParams;
      message_count: number;
      summary: SummaryRow[];
      tickets: TicketRow[];
      count: number;
      total: {
        chat_with_nutritionist_clicks: number;
        entry_point_1: number;
        entry_point_2: number;
      };
    }
  | { type: "error"; error: string };

function ndjsonLine(event: StreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = parseReportParams(
    sp.get("start_date"),
    sp.get("end_date"),
    sp.get("account_id"),
  );

  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const push = (event: StreamEvent) => controller.enqueue(ndjsonLine(event));

      try {
        push({ type: "progress", phase: "fetch", done: 0, total: 0 });

        const messages = await fetchMessageContent(parsed, ({ done, total }) => {
          push({ type: "progress", phase: "fetch", done, total });
        });

        push({ type: "progress", phase: "process" });

        const summary = buildSummaryFromMessages(messages, parsed);
        const base = buildTicketDumpFromMessages(messages, parsed);
        const tickets = await attachTicketLabels(base, parsed);

        push({
          type: "result",
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
            entry_point_1: summary.reduce(
              (s, r) => s + Number(r.entry_point_1),
              0,
            ),
            entry_point_2: summary.reduce(
              (s, r) => s + Number(r.entry_point_2),
              0,
            ),
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Query failed";
        push({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

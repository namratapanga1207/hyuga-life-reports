import { NextRequest, NextResponse } from "next/server";
import { runMetabaseSql } from "@/lib/metabase";
import { TICKET_DUMP_SQL } from "@/lib/queries";
import { parseReportParams } from "@/lib/params";

export const maxDuration = 300;

export type TicketRow = {
  month: string;
  phone_number: string;
  ticket_link: string;
  ticket_id: number;
  first_message: string;
  entry_type: string;
  level_1_tags: string;
  level_2_tags: string;
  system_tags: string;
};

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
    const rows = (await runMetabaseSql(TICKET_DUMP_SQL, parsed)) as TicketRow[];
    return NextResponse.json({
      params: parsed,
      count: rows.length,
      rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

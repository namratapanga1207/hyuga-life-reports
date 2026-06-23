import { NextRequest, NextResponse } from "next/server";
import { queryClickHouse } from "@/lib/clickhouse";
import { buildSummaryQuery } from "@/lib/queries";
import { parseReportParams } from "@/lib/params";

export type SummaryRow = {
  month: string;
  chat_with_nutritionist_clicks: number;
  entry_point_1: number;
  entry_point_2: number;
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
    const rows = await queryClickHouse<SummaryRow>(buildSummaryQuery(parsed));
    return NextResponse.json({
      params: parsed,
      rows,
      total: {
        chat_with_nutritionist_clicks: rows.reduce(
          (s, r) => s + Number(r.chat_with_nutritionist_clicks),
          0,
        ),
        entry_point_1: rows.reduce((s, r) => s + Number(r.entry_point_1), 0),
        entry_point_2: rows.reduce((s, r) => s + Number(r.entry_point_2), 0),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Query failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

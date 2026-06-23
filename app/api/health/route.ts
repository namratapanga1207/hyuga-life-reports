import { NextResponse } from "next/server";
import { clickhouseConfigured } from "@/lib/clickhouse";

export async function GET() {
  return NextResponse.json({
    clickhouse: await clickhouseConfigured(),
    accountId: Number(process.env.HYUGA_ACCOUNT_ID ?? "28052"),
  });
}

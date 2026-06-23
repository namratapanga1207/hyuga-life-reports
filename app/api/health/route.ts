import { NextResponse } from "next/server";
import { metabaseConfigured } from "@/lib/metabase";

export async function GET() {
  return NextResponse.json({
    metabase: metabaseConfigured(),
    accountId: Number(process.env.HYUGA_ACCOUNT_ID ?? "28052"),
  });
}

import { readFileSync } from "fs";
import { runMetabaseSql } from "../lib/metabase";

async function main() {
  const sql = readFileSync("./sql/metabase_card_2902.sql", "utf8");
  const rows = await runMetabaseSql(sql, {
    startDate: "2026-01-15",
    endDate: "2026-01-15",
    accountId: 28052,
  });
  console.log("rows", rows.length);
}

main().catch(console.error);

import type { ReportParams } from "./params";

type MetabaseCol = { name?: string; display_name?: string };

type MetabaseResponse = {
  status?: string;
  error?: string;
  message?: string;
  data?: { cols?: MetabaseCol[]; rows?: unknown[][] };
};

const TEMPLATE_TAGS = {
  start_date: { name: "start_date", display_name: "Start Date", type: "date" },
  end_date: { name: "end_date", display_name: "End Date", type: "date" },
  account_id: { name: "account_id", display_name: "Account Id", type: "number" },
} as const;

function config() {
  const apiKey = process.env.METABASE_API_KEY?.trim();
  const baseUrl = (
    process.env.METABASE_BASE_URL?.trim() ||
    process.env.METABASE_URL?.trim() ||
    "https://metabase.limechat.ai"
  ).replace(/\/$/, "");
  const databaseId = Number(process.env.METABASE_DATABASE_ID ?? "82");

  if (!apiKey) {
    throw new Error("METABASE_API_KEY is not configured");
  }
  if (!Number.isInteger(databaseId) || databaseId <= 0) {
    throw new Error("METABASE_DATABASE_ID must be a positive integer");
  }

  return { apiKey, baseUrl, databaseId };
}

function metabaseParameters(params: ReportParams) {
  return [
    {
      type: "date/single",
      target: ["variable", ["template-tag", "start_date"]],
      value: params.startDate,
    },
    {
      type: "date/single",
      target: ["variable", ["template-tag", "end_date"]],
      value: params.endDate,
    },
    {
      type: "number/=",
      target: ["variable", ["template-tag", "account_id"]],
      value: params.accountId,
    },
  ];
}

function parseRows(raw: MetabaseResponse): Record<string, unknown>[] {
  const cols = raw.data?.cols ?? [];
  const columns = cols.map(
    (c, i) => c.name ?? c.display_name ?? `col_${i}`,
  );
  return (raw.data?.rows ?? []).map((row) => {
    const out: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      out[col] = Array.isArray(row) ? row[idx] : null;
    });
    return out;
  });
}

export async function runMetabaseSql(
  sql: string,
  params: ReportParams,
): Promise<Record<string, unknown>[]> {
  const { apiKey, baseUrl, databaseId } = config();

  const response = await fetch(`${baseUrl}/api/dataset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
    },
    body: JSON.stringify({
      database: databaseId,
      type: "native",
      native: {
        query: sql,
        "template-tags": TEMPLATE_TAGS,
      },
      parameters: metabaseParameters(params),
      constraints: {
        "max-results": 500000,
        "max-results-bare-rows": 500000,
      },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(600_000),
  });

  const text = await response.text();
  let raw: MetabaseResponse = {};
  try {
    raw = text ? (JSON.parse(text) as MetabaseResponse) : {};
  } catch {
    throw new Error(text.slice(0, 300) || `Metabase HTTP ${response.status}`);
  }

  if (!response.ok || raw.status === "failed") {
    throw new Error(raw.error ?? raw.message ?? `Metabase HTTP ${response.status}`);
  }

  return parseRows(raw);
}

export function metabaseConfigured(): boolean {
  try {
    config();
    return true;
  } catch {
    return false;
  }
}

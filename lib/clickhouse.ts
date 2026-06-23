function getClickHouseConfig() {
  const host = process.env.CLICKHOUSE_HOST?.trim();
  const user = process.env.CLICKHOUSE_USER?.trim();
  const password = process.env.CLICKHOUSE_PASSWORD?.trim();
  const port = process.env.CLICKHOUSE_PORT?.trim() || "8443";

  if (!host || !user || !password) {
    throw new Error(
      "CLICKHOUSE_HOST, CLICKHOUSE_USER, and CLICKHOUSE_PASSWORD must be set",
    );
  }

  return { host, user, password, port };
}

export async function queryClickHouse<T extends Record<string, unknown>>(
  sql: string,
): Promise<T[]> {
  const { host, user, password, port } = getClickHouseConfig();
  const url = `https://${host}:${port}/`;

  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "text/plain; charset=utf-8",
    },
    body: sql,
    cache: "no-store",
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `ClickHouse error ${response.status}`);
  }

  if (!text.trim()) return [];

  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as T);
}

export async function clickhouseConfigured(): Promise<boolean> {
  try {
    getClickHouseConfig();
    return true;
  } catch {
    return false;
  }
}

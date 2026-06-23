import type { ReportParams } from "./params";
import { sqlLiteralDate, sqlUInt64 } from "./params";

export function buildSummaryQuery(params: ReportParams): string {
  const start = sqlLiteralDate(params.startDate);
  const end = sqlLiteralDate(params.endDate);
  const accountId = sqlUInt64(params.accountId);

  return `
WITH
range_start AS (
    SELECT toDateTime('${start}', 'Asia/Kolkata') AS dt
),
range_end AS (
    SELECT toDateTime('${end}', 'Asia/Kolkata') + INTERVAL 1 DAY AS dt
),

first_contact AS (
    SELECT
        toStartOfMonth(created_at, 'Asia/Kolkata') AS month_start,
        conversation_id,
        argMin(content, created_at) AS first_message,
        argMin(inbox_id, created_at) AS inbox_id
    FROM postgres_hd_messages
    WHERE account_id = ${accountId}
      AND message_type = 0
      AND created_at >= (SELECT dt FROM range_start)
      AND created_at < (SELECT dt FROM range_end)
    GROUP BY month_start, conversation_id
),

chat_clicks AS (
    SELECT
        toStartOfMonth(created_at, 'Asia/Kolkata') AS month_start,
        count(DISTINCT conversation_id) AS chat_with_nutritionist_clicks
    FROM postgres_hd_messages
    WHERE account_id = ${accountId}
      AND message_type = 0
      AND trim(content) = 'Chat with Nutritionist'
      AND created_at >= (SELECT dt FROM range_start)
      AND created_at < (SELECT dt FROM range_end)
    GROUP BY month_start
),

entry_points AS (
    SELECT
        month_start,
        countIf(
            inbox_id IN (35028, 35141)
            AND positionCaseInsensitive(first_message, 'looking for Nutritionist advice for my health & wellness needs') > 0
        ) AS entry_point_1,
        countIf(
            inbox_id IN (35028, 35141)
            AND startsWith(first_message, 'Hi, I need help with')
        ) AS entry_point_2
    FROM first_contact
    GROUP BY month_start
),

all_months AS (
    SELECT month_start FROM chat_clicks
    UNION DISTINCT
    SELECT month_start FROM entry_points
)

SELECT
    formatDateTime(m.month_start, '%M') AS month,
    coalesce(cc.chat_with_nutritionist_clicks, 0) AS chat_with_nutritionist_clicks,
    coalesce(ep.entry_point_1, 0) AS entry_point_1,
    coalesce(ep.entry_point_2, 0) AS entry_point_2
FROM all_months AS m
LEFT JOIN chat_clicks AS cc
    ON cc.month_start = m.month_start
LEFT JOIN entry_points AS ep
    ON ep.month_start = m.month_start
ORDER BY m.month_start
FORMAT JSONEachRow
`.trim();
}

export function buildTicketDumpQuery(params: ReportParams): string {
  const start = sqlLiteralDate(params.startDate);
  const end = sqlLiteralDate(params.endDate);
  const accountId = sqlUInt64(params.accountId);

  return `
WITH
params AS (
    SELECT
        toUInt64(${accountId}) AS account_id,
        toDateTime('${start}', 'Asia/Kolkata') AS start_dt,
        toDateTime('${end}', 'Asia/Kolkata') + INTERVAL 1 DAY AS end_dt_excl
),

client_l1 AS (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = (SELECT account_id FROM params)
      AND label_type = 'client'
      AND label_level = 0
),

client_l2 AS (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = (SELECT account_id FROM params)
      AND label_type = 'client'
      AND label_level = 1
),

system_labels AS (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = (SELECT account_id FROM params)
      AND label_type = 'system'
),

entry_tickets AS (
    SELECT
        conversation_id,
        argMin(content, created_at) AS first_message,
        argMin(inbox_id, created_at) AS first_inbox_id,
        min(created_at) AS first_message_at
    FROM postgres_hd_messages
    WHERE account_id = (SELECT account_id FROM params)
      AND message_type = 0
      AND inbox_id IN (35028, 35141)
      AND created_at >= (SELECT start_dt FROM params)
      AND created_at < (SELECT end_dt_excl FROM params)
      AND (
          positionCaseInsensitive(content, 'looking for Nutritionist advice for my health') > 0
          OR startsWith(content, 'Hi, I need help with')
      )
    GROUP BY conversation_id
),

chat_click_tickets AS (
    SELECT DISTINCT conversation_id
    FROM postgres_hd_messages
    WHERE account_id = (SELECT account_id FROM params)
      AND message_type = 0
      AND trim(content) = 'Chat with Nutritionist'
      AND created_at >= (SELECT start_dt FROM params)
      AND created_at < (SELECT end_dt_excl FROM params)
),

tickets AS (
    SELECT
        conversation_id,
        argMax(phone_number, created_at) AS phone_number,
        argMax(display_id, created_at) AS display_id,
        argMax(label_ids, created_at) AS label_ids
    FROM default.dim_conversation_overview
    WHERE account_id = (SELECT account_id FROM params)
    GROUP BY conversation_id
)

SELECT
    formatDateTime(toDate(et.first_message_at, 'Asia/Kolkata'), '%M') AS month,
    tk.phone_number AS phone_number,
    concat(
        'https://app.limechat.ai/app/accounts/',
        toString((SELECT account_id FROM params)),
        '/conversations/',
        toString(tk.display_id)
    ) AS ticket_link,
    tk.display_id AS ticket_id,
    et.first_message AS first_message,
    et.first_inbox_id AS inbox_id,
    if(
        positionCaseInsensitive(et.first_message, 'looking for Nutritionist advice for my health') > 0,
        'Entry Point 1',
        'Entry Point 2'
    ) AS entry_point,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(tk.label_ids, id), l1.titles, l1.ids)),
        ', '
    ) AS level_1_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(tk.label_ids, id), l2.titles, l2.ids)),
        ', '
    ) AS level_2_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(tk.label_ids, id), sl.titles, sl.ids)),
        ', '
    ) AS system_tags
FROM entry_tickets AS et
INNER JOIN chat_click_tickets AS cct
    ON cct.conversation_id = et.conversation_id
INNER JOIN tickets AS tk
    ON tk.conversation_id = et.conversation_id
CROSS JOIN client_l1 AS l1
CROSS JOIN client_l2 AS l2
CROSS JOIN system_labels AS sl
ORDER BY et.first_message_at
FORMAT JSONEachRow
`.trim();
}

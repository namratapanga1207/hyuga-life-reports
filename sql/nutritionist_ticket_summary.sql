-- Nutritionist funnel summary — matches nutritionist_report summary tab layout
-- Params: start_date, end_date, account_id

WITH
range_start AS (
    SELECT toDateTime(toString({{start_date}}), 'Asia/Kolkata') AS dt
),
range_end AS (
    SELECT toDateTime(toString({{end_date}}), 'Asia/Kolkata') + INTERVAL 1 DAY AS dt
),

first_contact AS (
    SELECT
        toStartOfMonth(created_at, 'Asia/Kolkata') AS month_start,
        conversation_id,
        argMin(content, created_at) AS first_message,
        argMin(inbox_id, created_at) AS inbox_id
    FROM postgres_hd_messages
    WHERE account_id = {{account_id}}
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
    WHERE account_id = {{account_id}}
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

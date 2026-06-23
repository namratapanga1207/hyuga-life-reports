-- Summary tab — matches Google Sheet / Colab logic
-- Params: start_date, end_date, account_id

WITH
params AS (
    SELECT
        toUInt64({{account_id}}) AS account_id,
        toDateTime(toString({{start_date}}), 'Asia/Kolkata') AS start_dt,
        toDateTime(toString({{end_date}}), 'Asia/Kolkata') + INTERVAL 1 DAY AS end_dt_excl
),

nutri_clicks AS (
    SELECT
        conversation_id,
        min(created_at) AS click_at
    FROM postgres_hd_messages
    PREWHERE account_id = (SELECT account_id FROM params)
      AND created_at >= (SELECT start_dt FROM params)
      AND created_at < (SELECT end_dt_excl FROM params)
    WHERE message_type = 0
      AND trim(content) = 'Chat with Nutritionist'
    GROUP BY conversation_id
),

first_incoming AS (
    SELECT
        nc.conversation_id AS conversation_id,
        argMin(m.content, m.created_at) AS first_message
    FROM nutri_clicks AS nc
    INNER JOIN postgres_hd_messages AS m
        ON m.conversation_id = nc.conversation_id
        AND m.account_id = (SELECT account_id FROM params)
    WHERE m.message_type = 0
      AND m.created_at <= nc.click_at
      AND positionCaseInsensitive(m.content, 'Chat with Nutritionist') = 0
    GROUP BY nc.conversation_id
),

tagged AS (
    SELECT
        nc.conversation_id,
        toStartOfMonth(nc.click_at, 'Asia/Kolkata') AS month_start,
        multiIf(
            positionCaseInsensitive(fi.first_message, 'looking for Nutritionist advice') > 0,
            'entry_point_1',
            positionCaseInsensitive(fi.first_message, 'I need help with') > 0,
            'entry_point_2',
            'other'
        ) AS entry_bucket
    FROM nutri_clicks AS nc
    LEFT JOIN first_incoming AS fi ON fi.conversation_id = nc.conversation_id
)

SELECT
    formatDateTime(month_start, '%M') AS month,
    count() AS chat_with_nutritionist_clicks,
    countIf(entry_bucket = 'entry_point_1') AS entry_point_1,
    countIf(entry_bucket = 'entry_point_2') AS entry_point_2
FROM tagged
GROUP BY month_start
ORDER BY month_start

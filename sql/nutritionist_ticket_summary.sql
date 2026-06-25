-- Summary tab — matches Google Sheet headers
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
      AND positionCaseInsensitive(content, 'Chat with Nutritionist') > 0
    GROUP BY conversation_id
),

first_incoming AS (
    SELECT
        conversation_id,
        argMin(content, created_at) AS first_message
    FROM postgres_hd_messages
    PREWHERE account_id = (SELECT account_id FROM params)
      AND created_at >= (SELECT start_dt FROM params)
      AND created_at < (SELECT end_dt_excl FROM params)
      AND conversation_id IN (SELECT conversation_id FROM nutri_clicks)
    WHERE message_type = 0
      AND positionCaseInsensitive(content, 'Chat with Nutritionist') = 0
    GROUP BY conversation_id
),

tagged AS (
    SELECT
        nc.conversation_id,
        toStartOfMonth(nc.click_at, 'Asia/Kolkata') AS month_start,
        fi.first_message AS first_message
    FROM nutri_clicks AS nc
    LEFT JOIN first_incoming AS fi ON fi.conversation_id = nc.conversation_id
)

SELECT
    formatDateTime(month_start, '%M') AS month,
    count() AS chat_with_nutritionist_clicks,
    countIf(
        lengthUTF8(first_message) = 70
            AND positionCaseInsensitive(
                first_message,
                'looking for Nutritionist advice for my health & wellness needs'
            ) > 0
    ) AS entry_point_1,
    countIf(
        startsWith(first_message, 'Hi, I need help with')
            AND positionCaseInsensitive(first_message, 'hyugalife.com/product') > 0
            AND position(first_message, '\n') = 0
    ) AS entry_point_2
FROM tagged
GROUP BY month_start
ORDER BY month_start

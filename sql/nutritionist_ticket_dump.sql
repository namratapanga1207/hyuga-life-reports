-- Ticket dump — January-style sheet (EP1 + EP2 only), Colab logic
-- Params: account_id, start_date, end_date

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
        conversation_id,
        argMin(content, created_at) AS first_message,
        argMin(inbox_id, created_at) AS first_inbox_id
    FROM postgres_hd_messages
    PREWHERE account_id = (SELECT account_id FROM params)
      AND created_at >= (SELECT start_dt FROM params)
      AND created_at < (SELECT end_dt_excl FROM params)
      AND conversation_id IN (SELECT conversation_id FROM nutri_clicks)
    WHERE message_type = 0
      AND positionCaseInsensitive(content, 'Chat with Nutritionist') = 0
    GROUP BY conversation_id
),

tickets AS (
    SELECT
        conversation_id,
        argMax(phone_number, created_at) AS phone_number,
        argMax(display_id, created_at) AS display_id
    FROM default.dim_conversation_overview
    WHERE account_id = (SELECT account_id FROM params)
      AND conversation_id IN (SELECT conversation_id FROM nutri_clicks)
    GROUP BY conversation_id
),

rows AS (
    SELECT
        formatDateTime(toStartOfMonth(nc.click_at, 'Asia/Kolkata'), '%M') AS month,
        tk.phone_number AS phone_number,
        concat(
            'https://app.limechat.ai/app/accounts/',
            toString((SELECT account_id FROM params)),
            '/conversations/',
            toString(tk.display_id)
        ) AS ticket_link,
        fi.first_message AS first_message,
        multiIf(
            fi.first_inbox_id IN (35028, 35141)
                AND positionCaseInsensitive(
                    fi.first_message,
                    'looking for Nutritionist advice for my health & wellness needs'
                ) > 0,
            'Entry Point 1',
            fi.first_inbox_id IN (35028, 35141)
                AND startsWith(fi.first_message, 'Hi, I need help with'),
            'Entry Point 2',
            'Other'
        ) AS entry_type,
        tk.display_id AS ticket_id,
        nc.click_at AS click_at
    FROM nutri_clicks AS nc
    INNER JOIN first_incoming AS fi ON fi.conversation_id = nc.conversation_id
    INNER JOIN tickets AS tk ON tk.conversation_id = nc.conversation_id
)

SELECT
    month,
    phone_number,
    ticket_link,
    first_message,
    entry_type,
    ticket_id
FROM rows
WHERE entry_type IN ('Entry Point 1', 'Entry Point 2')
ORDER BY click_at

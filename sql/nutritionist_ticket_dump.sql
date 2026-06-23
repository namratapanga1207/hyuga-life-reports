-- Ticket dump — January-style sheet (EP1 + EP2 only), Colab logic
-- Params: account_id, start_date, end_date

WITH
params AS (
    SELECT
        toUInt64({{account_id}}) AS account_id,
        toDateTime(toString({{start_date}}), 'Asia/Kolkata') AS start_dt,
        toDateTime(toString({{end_date}}), 'Asia/Kolkata') + INTERVAL 1 DAY AS end_dt_excl
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

nutri_clicks AS (
    SELECT
        conversation_id,
        min(created_at) AS click_at
    FROM postgres_hd_messages
    WHERE account_id = (SELECT account_id FROM params)
      AND created_at >= (SELECT start_dt FROM params)
      AND created_at < (SELECT end_dt_excl FROM params)
      AND positionCaseInsensitive(content, 'Chat with Nutritionist') > 0
    GROUP BY conversation_id
),

first_incoming AS (
    SELECT
        m.conversation_id,
        argMin(m.content, m.created_at) AS first_message
    FROM postgres_hd_messages AS m
    INNER JOIN nutri_clicks AS nc ON nc.conversation_id = m.conversation_id
    WHERE m.account_id = (SELECT account_id FROM params)
      AND m.message_type = 0
      AND positionCaseInsensitive(m.content, 'Chat with Nutritionist') = 0
    GROUP BY m.conversation_id
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
),

tagged AS (
    SELECT
        nc.conversation_id,
        formatDateTime(toStartOfMonth(nc.click_at, 'Asia/Kolkata'), '%M') AS month,
        tk.phone_number AS phone_number,
        concat(
            'https://app.limechat.ai/app/accounts/',
            toString((SELECT account_id FROM params)),
            '/conversations/',
            toString(tk.display_id)
        ) AS ticket_link,
        tk.display_id AS ticket_id,
        fi.first_message AS first_message,
        multiIf(
            positionCaseInsensitive(fi.first_message, 'looking for Nutritionist advice') > 0,
            'Entry Point 1',
            positionCaseInsensitive(fi.first_message, 'I need help with') > 0,
            'Entry Point 2',
            'Other'
        ) AS entry_type,
        tk.label_ids AS label_ids
    FROM nutri_clicks AS nc
    INNER JOIN first_incoming AS fi ON fi.conversation_id = nc.conversation_id
    INNER JOIN tickets AS tk ON tk.conversation_id = nc.conversation_id
)

SELECT
    t.month AS month,
    t.phone_number AS phone_number,
    t.ticket_link AS ticket_link,
    t.first_message AS first_message,
    t.entry_type AS entry_type,
    t.ticket_id AS ticket_id,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(t.label_ids, id), l1.titles, l1.ids)),
        ', '
    ) AS level_1_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(t.label_ids, id), l2.titles, l2.ids)),
        ', '
    ) AS level_2_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(t.label_ids, id), sl.titles, sl.ids)),
        ', '
    ) AS system_tags
FROM tagged AS t
CROSS JOIN client_l1 AS l1
CROSS JOIN client_l2 AS l2
CROSS JOIN system_labels AS sl
WHERE t.entry_type IN ('Entry Point 1', 'Entry Point 2')
ORDER BY t.ticket_id

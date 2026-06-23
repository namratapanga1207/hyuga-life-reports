-- Ticket dump — January sheet (391 rows for Jan 2026)
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

client_l3 AS (
    SELECT groupArray(toInt32(id)) AS ids, groupArray(title) AS titles
    FROM postgres_labels
    WHERE account_id = (SELECT account_id FROM params)
      AND label_type = 'client'
      AND label_level = 2
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

tickets AS (
    SELECT
        conversation_id,
        argMax(phone_number, created_at) AS phone_number,
        argMax(display_id, created_at) AS display_id,
        argMax(label_ids, created_at) AS label_ids
    FROM default.dim_conversation_overview
    WHERE account_id = (SELECT account_id FROM params)
      AND conversation_id IN (SELECT conversation_id FROM nutri_clicks)
    GROUP BY conversation_id
),

rows AS (
    SELECT
        tk.phone_number AS phone_number,
        concat(
            'https://app.limechat.ai/app/accounts/',
            toString((SELECT account_id FROM params)),
            '/conversations/',
            toString(tk.display_id)
        ) AS ticket_link,
        '' AS inbox,
        fi.first_message AS first_message,
        multiIf(
            lengthUTF8(fi.first_message) = 70
                AND positionCaseInsensitive(
                    fi.first_message,
                    'looking for Nutritionist advice for my health & wellness needs'
                ) > 0,
            'Entry Point 1',
            startsWith(fi.first_message, 'Hi, I need help with')
                AND positionCaseInsensitive(fi.first_message, 'hyugalife.com/product') > 0
                AND position(fi.first_message, '\n') = 0,
            'Entry Point 2',
            'Other'
        ) AS entry_type,
        tk.display_id AS ticket_id,
        tk.label_ids AS label_ids,
        nc.click_at AS click_at
    FROM nutri_clicks AS nc
    INNER JOIN first_incoming AS fi ON fi.conversation_id = nc.conversation_id
    INNER JOIN tickets AS tk ON tk.conversation_id = nc.conversation_id
)

SELECT
    r.phone_number AS phone_number,
    r.ticket_link AS ticket_link,
    r.inbox AS inbox,
    r.first_message AS first_message,
    r.entry_type AS entry_type,
    r.ticket_id AS ticket_id,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(r.label_ids, id), l1.titles, l1.ids)),
        ', '
    ) AS level_1_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(r.label_ids, id), l2.titles, l2.ids)),
        ', '
    ) AS level_2_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(r.label_ids, id), l3.titles, l3.ids)),
        ', '
    ) AS level_3_tags,
    arrayStringConcat(
        arraySort(arrayFilter((title, id) -> has(r.label_ids, id), sl.titles, sl.ids)),
        ', '
    ) AS system_tags
FROM rows AS r
CROSS JOIN client_l1 AS l1
CROSS JOIN client_l2 AS l2
CROSS JOIN client_l3 AS l3
CROSS JOIN system_labels AS sl
WHERE r.entry_type IN ('Entry Point 1', 'Entry Point 2')
ORDER BY r.click_at

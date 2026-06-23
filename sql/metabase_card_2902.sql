-- Metabase card 2902: Message Content (Inbox ID optional)
WITH
filtered_messages AS (
    SELECT
        id as message_id,
        conversation_id,
        created_at,
        content,
        message_type,
        private,
        sender_id,
        sender_type,
        account_id,
        content,
        template_id
    FROM datawarehouse.postgres_hd_messages
    WHERE account_id = {{account_id}}
      AND created_at >= toDateTime({{start_date}}, 'Asia/Kolkata')
      AND created_at <  toDateTime({{end_date}}, 'Asia/Kolkata') + INTERVAL 1 DAY
),
filtered_conversations AS (
    SELECT
        conversation_id,
        argMax(id,'created_at')            AS conv_id,
        argMax(assignee_id,'created_at')   AS agent_id,
        argMax(display_id,'created_at')    AS display_id,
        argMax(contact_id,'created_at')    AS contact_id,
        argMax(inbox_id,'created_at')      AS inbox_id,
        argMax(contact_name,'created_at')  AS contact_name,
        argMax(phone_number,'created_at')  AS phone_number,
        argMax(email,'created_at')         AS email
    FROM default.dim_conversation_overview
    WHERE conversation_id IN (SELECT conversation_id FROM filtered_messages)
      AND account_id = {{account_id}}
    GROUP BY conversation_id
),
deduped_users AS (
    SELECT
        id,
        argMax(name, created_at) AS name
    FROM datawarehouse.postgres_users
    GROUP BY id
)
SELECT
    fm.message_id as message_id,
    fm.created_at AS created_at_content,
    fm.conversation_id AS conversation_id,
    CASE
        WHEN lower(fm.sender_type) = 'contact' THEN toString(fc.contact_id)
        ELSE ''
    END AS contact_id,
    CASE
        WHEN lower(fm.sender_type) = 'user' THEN toString(fc.agent_id)
        ELSE ''
    END AS agent_id,
    CASE
        WHEN lower(fm.sender_type) = 'user' THEN pu.name
        ELSE ''
    END AS agent_name,
    fc.inbox_id AS inbox_id,
    fm.template_id AS template_id,
    fc.display_id AS display_id,
    CASE
        WHEN fm.message_type = 0  THEN 'Incoming'
        WHEN fm.message_type = 1  THEN 'Outgoing'
        WHEN fm.message_type = 2  THEN 'Activity'
        WHEN fm.message_type = 3  THEN 'template'
        WHEN fm.message_type = 4  THEN 'sync_in'
        WHEN fm.message_type = 5  THEN 'sync_out'
        WHEN fm.message_type = 6  THEN 'start_conversation'
        WHEN fm.message_type = 7  THEN 'info_collect'
        WHEN fm.message_type = 8  THEN 'outbound_bot'
        WHEN fm.message_type = 9  THEN 'out_of_office'
        WHEN fm.message_type = 10 THEN 'forwarded_mail'
        WHEN fm.message_type = 11 THEN 'csat_question'
        WHEN fm.message_type = 12 THEN 'opt_in'
        WHEN fm.message_type = 13 THEN 'opt_out'
        WHEN fm.message_type = 14 THEN 'gpt'
        ELSE toString(fm.message_type)
    END AS incoming_or_outcoming,
    fc.contact_name AS contact_name,
    fc.phone_number AS phone_number,
    fc.email AS email,
    fm.content AS message_content,
    fm.sender_type AS sender_type
FROM filtered_messages fm
LEFT JOIN filtered_conversations fc
    ON fm.conversation_id = fc.conversation_id
LEFT JOIN deduped_users pu
    ON toString(fc.agent_id) = toString(pu.id)

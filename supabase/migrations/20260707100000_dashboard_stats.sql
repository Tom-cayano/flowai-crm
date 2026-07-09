-- =============================================================================
-- Migration: dashboard_stats(p_user_id)
--
-- Métricas reales para el panel principal en una sola llamada RPC.
-- Sustituye los datos mock del dashboard: contactos, conversaciones,
-- mensajes, leads, automatizaciones, actividad reciente y top contactos.
--
-- SECURITY DEFINER + EXECUTE solo para service_role: se invoca desde el
-- servidor (admin client) pasando el user_id autenticado; nunca desde el
-- navegador.
-- =============================================================================

create or replace function public.dashboard_stats(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
with
mine_contacts as (
  select * from contacts where user_id = p_user_id
),
mine_convs as (
  select * from conversations where user_id = p_user_id
),
mine_msgs as (
  select m.*
  from messages m
  join mine_convs cv on cv.id = m.conversation_id
),
resp as (
  -- Tiempo primera respuesta por conversación (agente tras primer msj del contacto)
  select avg(extract(epoch from (a.first_agent - c.first_contact))) as avg_seconds
  from (
    select conversation_id, min(created_at) as first_contact
    from mine_msgs where sender = 'contact' group by 1
  ) c
  join (
    select conversation_id, min(created_at) as first_agent
    from mine_msgs where sender = 'agent' group by 1
  ) a using (conversation_id)
  where a.first_agent > c.first_contact
),
per_day as (
  select
    d.day::date as day,
    count(m.id) filter (where m.sender = 'agent')   as sent,
    count(m.id)                                      as total,
    count(distinct m.conversation_id)                as convs
  from generate_series(current_date - interval '6 days', current_date, interval '1 day') as d(day)
  left join mine_msgs m on m.created_at >= d.day and m.created_at < d.day + interval '1 day'
  group by 1 order by 1
),
activity as (
  select * from (
    select 'new_contact'  as type,
           name || ' añadido como contacto'                       as text,
           created_at                                             as ts
    from mine_contacts order by created_at desc limit 4
  ) a
  union all
  select * from (
    select 'conversation' as type,
           'Mensaje de ' || cv.contact_name                       as text,
           m.created_at                                           as ts
    from mine_msgs m join mine_convs cv on cv.id = m.conversation_id
    where m.sender = 'contact' order by m.created_at desc limit 4
  ) b
  union all
  select * from (
    select 'automation'   as type,
           'Automatización «' || au.name || '» ejecutada'         as text,
           e.started_at                                           as ts
    from automation_executions e join automations au on au.id = e.automation_id
    where e.user_id = p_user_id order by e.started_at desc limit 4
  ) c
),
top_contacts as (
  select c.id, c.name, c.company, c.status,
         count(m.id)        as messages,
         max(m.created_at)  as last_message_at
  from mine_contacts c
  join mine_convs cv on cv.contact_id = c.id
  join messages m on m.conversation_id = cv.id
  group by c.id, c.name, c.company, c.status
  order by count(m.id) desc
  limit 5
)
select jsonb_build_object(
  'total_contacts',       (select count(*) from mine_contacts),
  'contacts_30d',         (select count(*) from mine_contacts where created_at >= now() - interval '30 days'),
  'contacts_prev_30d',    (select count(*) from mine_contacts where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
  'leads_total',          (select count(*) from mine_contacts where source is not null),
  'leads_30d',            (select count(*) from mine_contacts where source is not null and created_at >= now() - interval '30 days'),
  'conversations_open',   (select count(*) from mine_convs where status = 'open'),
  'conversations_pending',(select count(*) from mine_convs where status = 'pending'),
  'conversations_30d',    (select count(*) from mine_convs where created_at >= now() - interval '30 days'),
  'conversations_prev_30d',(select count(*) from mine_convs where created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
  'messages_sent_30d',    (select count(*) from mine_msgs where sender = 'agent' and created_at >= now() - interval '30 days'),
  'messages_sent_prev_30d',(select count(*) from mine_msgs where sender = 'agent' and created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
  'answered_conversations',(select count(*) from mine_convs where last_message_sender = 'agent'),
  'started_conversations', (select count(*) from mine_convs where last_message_at is not null),
  'avg_response_seconds', (select avg_seconds from resp),
  'automations_active',   (select count(*) from automations where user_id = p_user_id and status = 'active'),
  'messages_per_day',     (select coalesce(jsonb_agg(jsonb_build_object('day', day, 'sent', sent, 'total', total, 'conversations', convs) order by day), '[]'::jsonb) from per_day),
  'recent_activity',      (select coalesce(jsonb_agg(jsonb_build_object('type', type, 'text', text, 'ts', ts) order by ts desc), '[]'::jsonb) from (select * from activity order by ts desc limit 8) x),
  'top_contacts',         (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'company', company, 'status', status, 'messages', messages, 'last_message_at', last_message_at) order by messages desc), '[]'::jsonb) from top_contacts),
  'email',                (select jsonb_build_object(
                             'sent',      count(*) filter (where status in ('sent','delivered')),
                             'delivered', count(*) filter (where status = 'delivered'),
                             'opened',    count(*) filter (where opened_at is not null),
                             'clicked',   count(*) filter (where clicked_at is not null),
                             'bounced',   count(*) filter (where status = 'bounced'),
                             'failed',    count(*) filter (where status = 'failed')
                           ) from email_logs where user_id = p_user_id and created_at >= now() - interval '30 days')
);
$$;

revoke all on function public.dashboard_stats(uuid) from public;
revoke all on function public.dashboard_stats(uuid) from anon;
revoke all on function public.dashboard_stats(uuid) from authenticated;
grant execute on function public.dashboard_stats(uuid) to service_role;

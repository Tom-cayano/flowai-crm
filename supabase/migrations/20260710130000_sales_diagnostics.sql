-- =============================================================================
-- FASE 9 — Diagnóstico/observabilidad del recepcionista comercial.
-- Métricas en tiempo real: conversaciones, ventas iniciadas/cerradas, embudos,
-- contexto, citas, tiempos de respuesta. Una sola llamada RPC.
-- =============================================================================

create or replace function public.sales_diagnostics(p_user_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
with
funnel as (
  select
    custom_fields->>'funnel_context' as ctx,
    custom_fields->>'funnel_state'   as state,
    tags
  from contacts
  where user_id = p_user_id
    and (custom_fields ? 'funnel_state' or 'cliente-potencial' = any(tags))
),
appts as (
  select kind, status, scheduled_at from appointments where user_id = p_user_id
)
select jsonb_build_object(
  -- Conversaciones en el embudo comercial
  'conversaciones_activas',   (select count(*) from funnel where state is not null and state <> 'booked'),
  'por_contexto',             jsonb_build_object(
                                'gimnasio', (select count(*) from funnel where ctx = 'gym'),
                                'online',   (select count(*) from funnel where ctx = 'online'),
                                'recepcion',(select count(*) from funnel where state = 'reception')
                              ),
  -- Ventas iniciadas / cerradas
  'ventas_iniciadas',         (select count(*) from funnel where 'cliente-potencial' = any(tags)),
  'cierres_enviados',         (select count(*) from contacts where user_id = p_user_id and ('cierre-gym' = any(tags) or 'cierre-online' = any(tags))),
  'cierres_gym',              (select count(*) from contacts where user_id = p_user_id and 'cierre-gym' = any(tags)),
  'cierres_online',           (select count(*) from contacts where user_id = p_user_id and 'cierre-online' = any(tags)),
  -- Reservas (valoraciones + clases de prueba)
  'valoraciones_reservadas',  (select count(*) from appts where kind like 'valoracion%' and status = 'confirmed'),
  'clases_prueba_solicitadas',(select count(*) from contacts where user_id = p_user_id and 'clase-prueba-solicitada' = any(tags)),
  'citas_proximas',           (select count(*) from appts where status = 'confirmed' and scheduled_at >= now()),
  'no_shows',                 (select count(*) from appts where status = 'no_show'),
  -- Embudo por estado
  'embudo',                   (select coalesce(jsonb_object_agg(state, n), '{}'::jsonb) from (select state, count(*) n from funnel where state is not null group by state) e),
  -- Seguimientos manuales pendientes
  'seguimiento_manual',       (select count(*) from contacts where user_id = p_user_id and 'seguimiento-manual' = any(tags)),
  -- Salud del canal
  'instancia_whatsapp',       (select jsonb_build_object('instance', instance_name, 'estado', connection_state) from whatsapp_instances where user_id = p_user_id and is_active = true order by updated_at desc limit 1),
  'generado_en',              now()
);
$$;

revoke all on function public.sales_diagnostics(uuid) from public, anon, authenticated;
grant execute on function public.sales_diagnostics(uuid) to service_role;

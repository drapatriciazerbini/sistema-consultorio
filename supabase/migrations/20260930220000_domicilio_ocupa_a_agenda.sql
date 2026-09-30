begin;

/**
 * O domicilio ocupa a agenda inteira da medica (30/09/2026).
 *
 * Pedido da Dra. Patricia: "se marcar um domicilio na quarta de manha, acabou
 * a manha". Ate aqui uma consulta so ocupava o horario da PROPRIA unidade: uma
 * visita em casa das 9h as 12h nao tirava nada do consultorio, e o robo e a
 * Agenda ofereciam o consultorio as 9h30 como livre.
 *
 * Agora, nas duas funcoes que calculam horario livre (available_slots, do
 * robo e da Agenda, e horarios_livres_entre, do "marcar retorno"):
 *  - consulta da mesma unidade ocupa, como sempre;
 *  - consulta de OUTRA unidade ocupa quando uma das duas e a visita em casa;
 *  - em volta da visita entra uma margem de deslocamento
 *    (clinic_settings.domicilio_margem_minutos, 30 por padrao).
 *
 * A visita em casa e marcada na Agenda com a duracao que precisar (1h, 2h, 3h,
 * manha ou tarde inteira): ends_at ja existe, so nao era usado com outra
 * duracao alem da padrao.
 */

alter table public.clinic_settings
  add column if not exists domicilio_margem_minutos integer not null default 30;

alter table public.clinic_settings
  drop constraint if exists clinic_settings_domicilio_margem_valida;
alter table public.clinic_settings
  add constraint clinic_settings_domicilio_margem_valida
  check (domicilio_margem_minutos between 0 and 180);

comment on column public.clinic_settings.domicilio_margem_minutos is
  'Minutos de deslocamento antes e depois de uma visita em casa, em que a agenda da medica fica ocupada.';

create or replace function public.available_slots(p_unit_id uuid)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
declare
  v_clinic_id uuid;
  v_eh_visita boolean;
  v_margem integer;
  v_tz text;
  v_slot_minutes integer;
  v_horizon_days integer;
  v_notice_hours integer;
  v_primeiro_dia date;
  v_ultimo_dia date;
begin
  select unit.clinic_id, coalesce(clinic.timezone, 'America/Sao_Paulo'), coalesce(unit.is_home_visit, false)
    into v_clinic_id, v_tz, v_eh_visita
  from public.clinic_units unit
  join public.clinics clinic on clinic.id = unit.clinic_id
  where unit.id = p_unit_id and unit.archived_at is null;

  if v_clinic_id is null then
    return;
  end if;

  select coalesce(settings.schedule_slot_minutes, 40),
         coalesce(settings.schedule_horizon_days, 15),
         coalesce(settings.schedule_min_notice_hours, 2)
    into v_slot_minutes, v_horizon_days, v_notice_hours
  from public.clinic_settings settings
  where settings.clinic_id = v_clinic_id;

  select coalesce(settings.domicilio_margem_minutos, 30)
    into v_margem
  from public.clinic_settings settings
  where settings.clinic_id = v_clinic_id;
  v_margem := coalesce(v_margem, 30);

  v_slot_minutes := coalesce(v_slot_minutes, 40);
  v_horizon_days := coalesce(v_horizon_days, 15);
  v_notice_hours := coalesce(v_notice_hours, 2);

  v_primeiro_dia := (now() at time zone v_tz)::date;
  v_ultimo_dia := v_primeiro_dia + v_horizon_days;

  return query
  with dias as (
    select generate_series(v_primeiro_dia, v_ultimo_dia, interval '1 day')::date as dia
  ),
  fechados as (
    select d.dia
    from dias d
    join public.schedule_exceptions e
      on e.exception_date = d.dia
     and e.clinic_id = v_clinic_id
     and e.is_closed
     and (e.unit_id is null or e.unit_id = p_unit_id)
  ),
  periodos as (
    select d.dia, r.starts_at, r.ends_at
    from dias d
    join public.availability_rules r
      on r.unit_id = p_unit_id
     and r.weekday = extract(dow from d.dia)::smallint
    where d.dia not in (select dia from fechados)
    union all
    select d.dia, e.starts_at, e.ends_at
    from dias d
    join public.schedule_exceptions e
      on e.exception_date = d.dia
     and e.clinic_id = v_clinic_id
     and not e.is_closed
     and (e.unit_id is null or e.unit_id = p_unit_id)
  ),
  blocos as (
    select
      ((p.dia + p.starts_at) at time zone v_tz) as inicio_local,
      ((p.dia + p.ends_at) at time zone v_tz) as fim_local
    from periodos p
  ),
  candidatos as (
    select
      gs as inicio,
      gs + make_interval(mins => v_slot_minutes) as fim
    from blocos b,
    lateral generate_series(
      b.inicio_local,
      b.fim_local - make_interval(mins => v_slot_minutes),
      make_interval(mins => v_slot_minutes)
    ) as gs
  )
  select distinct c.inicio, c.fim
  from candidatos c
  where c.inicio >= now() + make_interval(hours => v_notice_hours)
    and not exists (
      select 1
      from public.appointments a
      join public.clinic_units au on au.id = a.unit_id
      where a.clinic_id = v_clinic_id
        and a.status <> 'cancelled'
        -- Solicitacao sem confirmacao que passou do prazo nao segura mais a
        -- vaga: ela volta a ser oferecida.
        and (a.hold_expires_at is null or a.hold_expires_at > now())
        -- Mesma unidade, como sempre. Outra unidade so ocupa quando uma das
        -- duas e a visita em casa: a medica fora do consultorio nao atende la.
        and (a.unit_id = p_unit_id or coalesce(au.is_home_visit, false) or v_eh_visita)
        and a.starts_at - case when coalesce(au.is_home_visit, false) or v_eh_visita
                               then make_interval(mins => v_margem) else interval '0' end < c.fim
        and a.ends_at + case when coalesce(au.is_home_visit, false) or v_eh_visita
                             then make_interval(mins => v_margem) else interval '0' end > c.inicio
    )
  order by c.inicio;
end;
$fn$;

create or replace function public.horarios_livres_entre(
  p_unit_id uuid,
  p_de date,
  p_ate date
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security invoker
set search_path = ''
as $fn$
declare
  v_clinic_id uuid;
  v_eh_visita boolean;
  v_margem integer;
  v_tz text;
  v_slot_minutes integer;
  v_notice_hours integer;
  v_hoje date;
  v_de date;
  v_ate date;
begin
  select unit.clinic_id, coalesce(clinic.timezone, 'America/Sao_Paulo'), coalesce(unit.is_home_visit, false)
    into v_clinic_id, v_tz, v_eh_visita
  from public.clinic_units unit
  join public.clinics clinic on clinic.id = unit.clinic_id
  where unit.id = p_unit_id and unit.archived_at is null;

  if v_clinic_id is null then
    return;
  end if;

  select coalesce(settings.schedule_slot_minutes, 40),
         coalesce(settings.schedule_min_notice_hours, 2)
    into v_slot_minutes, v_notice_hours
  from public.clinic_settings settings
  where settings.clinic_id = v_clinic_id;

  select coalesce(settings.domicilio_margem_minutos, 30)
    into v_margem
  from public.clinic_settings settings
  where settings.clinic_id = v_clinic_id;
  v_margem := coalesce(v_margem, 30);

  v_slot_minutes := coalesce(v_slot_minutes, 40);
  v_notice_hours := coalesce(v_notice_hours, 2);

  v_hoje := (now() at time zone v_tz)::date;
  v_de := greatest(p_de, v_hoje);
  v_ate := least(p_ate, v_de + 31, v_hoje + 400);
  if v_ate < v_de then
    return;
  end if;

  return query
  with dias as (
    select generate_series(v_de, v_ate, interval '1 day')::date as dia
  ),
  fechados as (
    select d.dia
    from dias d
    join public.schedule_exceptions e
      on e.exception_date = d.dia
     and e.clinic_id = v_clinic_id
     and e.is_closed
     and (e.unit_id is null or e.unit_id = p_unit_id)
  ),
  periodos as (
    select d.dia, r.starts_at, r.ends_at
    from dias d
    join public.availability_rules r
      on r.unit_id = p_unit_id
     and r.weekday = extract(dow from d.dia)::smallint
    where d.dia not in (select dia from fechados)
    union all
    select d.dia, e.starts_at, e.ends_at
    from dias d
    join public.schedule_exceptions e
      on e.exception_date = d.dia
     and e.clinic_id = v_clinic_id
     and not e.is_closed
     and (e.unit_id is null or e.unit_id = p_unit_id)
  ),
  blocos as (
    select
      ((p.dia + p.starts_at) at time zone v_tz) as inicio_local,
      ((p.dia + p.ends_at) at time zone v_tz) as fim_local
    from periodos p
  ),
  candidatos as (
    select
      gs as inicio,
      gs + make_interval(mins => v_slot_minutes) as fim
    from blocos b,
    lateral generate_series(
      b.inicio_local,
      b.fim_local - make_interval(mins => v_slot_minutes),
      make_interval(mins => v_slot_minutes)
    ) as gs
  )
  select distinct c.inicio, c.fim
  from candidatos c
  where c.inicio >= now() + make_interval(hours => v_notice_hours)
    and not exists (
      select 1
      from public.appointments a
      join public.clinic_units au on au.id = a.unit_id
      where a.clinic_id = v_clinic_id
        and a.status <> 'cancelled'
        -- Solicitacao sem confirmacao que passou do prazo nao segura mais a
        -- vaga: ela volta a ser oferecida.
        and (a.hold_expires_at is null or a.hold_expires_at > now())
        -- Mesma unidade, como sempre. Outra unidade so ocupa quando uma das
        -- duas e a visita em casa: a medica fora do consultorio nao atende la.
        and (a.unit_id = p_unit_id or coalesce(au.is_home_visit, false) or v_eh_visita)
        and a.starts_at - case when coalesce(au.is_home_visit, false) or v_eh_visita
                               then make_interval(mins => v_margem) else interval '0' end < c.fim
        and a.ends_at + case when coalesce(au.is_home_visit, false) or v_eh_visita
                             then make_interval(mins => v_margem) else interval '0' end > c.inicio
    )
  order by c.inicio;
end;
$fn$;

comment on function public.available_slots(uuid) is
  'Horarios livres de uma unidade, considerando regras semanais, excecoes, consultas marcadas (a visita em casa ocupa todas as unidades, com margem de deslocamento), reservas provisorias ainda validas e antecedencia minima.';
grant execute on function public.available_slots(uuid) to authenticated, service_role;

revoke all on function public.horarios_livres_entre(uuid, date, date) from public, anon;
grant execute on function public.horarios_livres_entre(uuid, date, date) to authenticated;

commit;

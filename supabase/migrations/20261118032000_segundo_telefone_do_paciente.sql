begin;

/**
 * Mais de um telefone no mesmo cadastro (porte de 18/11/2026).
 *
 * No sistema do Dr. Marcello, em 13/11/2026: uma pessoa da familia marcou a
 * consulta pelo celular dela, e outra escrevia de outro numero para mandar
 * exame. O cadastro so tinha um telefone, e a segunda aparecia como "Contato
 * sem cadastro". Pedido do Edu: "da para integrar 2 telefones no mesmo
 * cadastro?".
 *
 * Aqui isso e o dia a dia: o cadastro tem o celular do proprio idoso ou de
 * uma filha, e quem escreve e outro filho, o conjuge ou o cuidador do turno,
 * cada um do seu numero.
 *
 * patients.phone continua sendo o telefone do cadastro, o unico que recebe
 * lembrete e acompanhamento. Aqui ficam os outros, so para reconhecer quem
 * escreve e ligar a conversa ao mesmo paciente.
 *
 * A tela so le. Quem grava sao as duas funcoes abaixo, que conferem a
 * permissao: ligar um numero a um paciente e decisao da equipe, nunca do robo.
 *
 * Tabela nova: o codigo le em consulta separada, com try/catch. Sem esta
 * migration o numero continua "sem cadastro", como era, e o log diz por que.
 */
create table if not exists public.patient_phones (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  -- So digitos, como a Meta entrega (55 + DDD + numero). A busca usa todas as
  -- grafias (com e sem 55, com e sem o nono digito).
  digits text not null check (digits ~ '^[0-9]{10,15}$'),
  -- De quem e o numero: "Filha", "Cuidador(a)"... Aparece embaixo do nome do
  -- paciente na conversa.
  rotulo text check (rotulo is null or char_length(rotulo) between 1 and 40),
  created_at timestamptz not null default now(),
  created_by uuid,
  unique (patient_id, digits)
);

create index if not exists patient_phones_clinic_digits_idx
  on public.patient_phones (clinic_id, digits);

comment on table public.patient_phones is
  'Outros telefones do mesmo cadastro (filha, filho, conjuge, cuidador). So reconhecem quem escreve; lembrete e acompanhamento saem para patients.phone.';

alter table public.patient_phones enable row level security;
alter table public.patient_phones force row level security;

-- So leitura, e so de quem e membro da clinica da linha: a mesma pergunta das
-- tabelas vizinhas (whatsapp_conversations, whatsapp_messages). Nao ha policy
-- de insert, update ou delete: com a RLS forcada, a tela nao grava aqui nem
-- que alguem de o grant por engano.
drop policy if exists patient_phones_leitura on public.patient_phones;
create policy patient_phones_leitura on public.patient_phones
  for select to authenticated
  using ((select private.is_clinic_member(clinic_id)));

-- Leitura liberada coluna a coluna: a tela so precisa destas. created_by
-- (quem ligou o numero) fica para auditoria, pelo servidor.
revoke all on table public.patient_phones from public, anon, authenticated;
grant select (id, clinic_id, patient_id, digits, rotulo, created_at)
  on table public.patient_phones to authenticated;
-- O webhook e as edge functions (service_role) leem para reconhecer quem
-- escreve. Sem este grant a busca falharia calada no try/catch e o numero
-- voltaria a ser "sem cadastro".
grant select, insert, update, delete on table public.patient_phones to service_role;

/**
 * "Este numero ja e de um paciente cadastrado": liga o telefone da conversa ao
 * paciente. A conversa e as mensagens sem dono passam a ser dele, como no
 * vincular_contato_ao_paciente. Conversa que ja e de outro paciente nao muda
 * de dono: o numero so passa a ser reconhecido tambem para este.
 */
create or replace function public.ligar_telefone_ao_paciente(
  p_conversation_id uuid,
  p_patient_id uuid,
  p_rotulo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_clinic_id uuid;
  v_wa_id text;
  v_digits text;
begin
  select c.clinic_id, c.wa_id
    into v_clinic_id, v_wa_id
  from public.whatsapp_conversations c
  where c.id = p_conversation_id;

  if v_clinic_id is null then
    raise exception 'Conversa nao encontrada.';
  end if;

  if not (select private.is_clinic_editor(v_clinic_id)) then
    raise exception 'Sem permissao para mudar cadastros nesta clinica.';
  end if;

  if not exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.clinic_id = v_clinic_id and p.archived_at is null
  ) then
    raise exception 'Paciente nao encontrado nesta clinica.';
  end if;

  v_digits := regexp_replace(coalesce(v_wa_id, ''), '[^0-9]', '', 'g');
  if v_digits !~ '^[0-9]{10,15}$' then
    raise exception 'O numero desta conversa nao parece um telefone.';
  end if;

  insert into public.patient_phones (clinic_id, patient_id, digits, rotulo, created_by)
  values (
    v_clinic_id,
    p_patient_id,
    v_digits,
    nullif(left(btrim(coalesce(p_rotulo, '')), 40), ''),
    (select auth.uid())
  )
  on conflict (patient_id, digits) do update set rotulo = excluded.rotulo;

  update public.whatsapp_conversations
     set patient_id = p_patient_id
   where id = p_conversation_id and patient_id is null;

  update public.whatsapp_messages m
     set patient_id = p_patient_id
   where m.conversation_id = p_conversation_id
     and m.patient_id is null
     and exists (
       select 1 from public.whatsapp_conversations c
       where c.id = p_conversation_id and c.patient_id = p_patient_id
     );
end;
$fn$;

comment on function public.ligar_telefone_ao_paciente(uuid, uuid, text) is
  'Liga o telefone da conversa a um paciente ja cadastrado, como segundo telefone (patient_phones).';

revoke all on function public.ligar_telefone_ao_paciente(uuid, uuid, text) from public, anon;
grant execute on function public.ligar_telefone_ao_paciente(uuid, uuid, text) to authenticated;

/**
 * "Este numero nao e do paciente" (20261107120000) agora tambem tira o segundo
 * telefone. Sem isto, desligar a conversa nao adiantava: o numero continuava
 * em patient_phones e a proxima mensagem ligava de novo.
 *
 * Mesma assinatura e mesmas permissoes da versao anterior; so o corpo muda.
 */
create or replace function public.desvincular_conversa_do_paciente(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_clinic_id uuid;
  v_patient_id uuid;
  v_digits text;
begin
  select c.clinic_id, c.patient_id, regexp_replace(coalesce(c.wa_id, ''), '[^0-9]', '', 'g')
    into v_clinic_id, v_patient_id, v_digits
  from public.whatsapp_conversations c
  where c.id = p_conversation_id;

  if v_clinic_id is null then
    raise exception 'Conversa nao encontrada.';
  end if;

  if not (select private.is_clinic_editor(v_clinic_id)) then
    raise exception 'Sem permissao para mudar conversas nesta clinica.';
  end if;

  -- Os ultimos 8 digitos cobrem o numero com e sem 55 e com e sem o nono
  -- digito; o paciente da conversa limita a quem e desligado.
  if v_patient_id is not null and char_length(v_digits) >= 8 then
    delete from public.patient_phones ph
     where ph.clinic_id = v_clinic_id
       and ph.patient_id = v_patient_id
       and right(ph.digits, 8) = right(v_digits, 8);
  end if;

  update public.whatsapp_conversations
  set patient_id = null
  where id = p_conversation_id;
end;
$fn$;

comment on function public.desvincular_conversa_do_paciente(uuid) is
  'Desliga a conversa do cadastro do paciente, quando o telefone casou com o paciente errado; tira tambem o segundo telefone (patient_phones).';

revoke all on function public.desvincular_conversa_do_paciente(uuid) from public, anon;
grant execute on function public.desvincular_conversa_do_paciente(uuid) to authenticated;

commit;

begin;

/**
 * Cadastro que nasceu com o nome do contato do WhatsApp.
 *
 * Quando a ficha fica sem o nome do paciente, o cadastro automatico usa o nome
 * do contato do WhatsApp. Aqui quase sempre e o de quem escreveu: a filha, o
 * neto, o cuidador. No sistema do Dr. Marcello (18/10/2026) uma menina foi
 * cadastrada com o nome da mae; o Edu preferiu manter o cadastro (sem ele nao
 * ha prontuario), mas com um aviso vermelho ate alguem confirmar o nome,
 * porque receita e atestado saem com ele.
 *
 * Nulo depois que alguem da equipe salva o cadastro com o nome conferido.
 * Ver supabase/functions/_shared/cadastro.ts.
 */
alter table public.patients
  add column if not exists name_from_contact_at timestamptz;

comment on column public.patients.name_from_contact_at is
  'Quando o sistema criou o cadastro com o nome do contato do WhatsApp, porque a ficha ficou sem o nome do paciente. Nulo depois que alguem da equipe confere e salva o nome.';

-- A tela limpa a marca ao salvar o cadastro com o nome conferido. O
-- service_role (cadastro automatico) ja tem insert e update na tabela inteira
-- (20260823193000, 20260908130000).
grant update (name_from_contact_at) on table public.patients to authenticated;

commit;

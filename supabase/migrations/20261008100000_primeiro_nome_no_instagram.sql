begin;

/**
 * Primeiro nome no Direct (08/10/2026).
 *
 * O robô passa a chamar a pessoa pelo primeiro nome ("Maria, ..."). O nome vem
 * do perfil do Instagram, lido uma vez por conversa na Graph API.
 *   null  = ainda não procurado
 *   ''    = procurado e sem nome aproveitável (marca, apelido, emoji)
 * Só o primeiro nome, nada mais do perfil. A tabela segue fechada para o
 * front (só service_role), como desde a criação.
 */

alter table public.instagram_conversations
  add column if not exists first_name text;

commit;

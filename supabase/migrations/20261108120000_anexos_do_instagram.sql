begin;

/**
 * Ver o que chega no Direct (08/11/2026).
 *
 * Pedido do Edu: no chat do Instagram da Central, foto, audio, video e reel
 * apareciam so como "[foto]", "[áudio]", "[reel compartilhado]" - e tipo
 * desconhecido como "[anexo]", sem nem dizer o que era (a Rita mandou tres
 * "[anexo]" junto com a pergunta do anuncio e ninguem sabe o que foram).
 *
 * COMO A META ENTREGA: diferente do WhatsApp, o aviso do Direct ja traz a URL
 * do arquivo (attachments[].payload.url). Mas e URL de CDN assinada, que
 * vence. Entao o servidor copia o arquivo para um acervo nosso logo depois de
 * gravar a mensagem, como no WhatsApp (20260924000800).
 *
 * UMA COLUNA SO, jsonb: o Direct manda varios anexos numa mensagem (ate dez
 * fotos), e coluna por coluna so caberia o primeiro. Cada item:
 *   { "tipo": "image", "url": "<da Meta>", "path": "<acervo>", "mime": "image/jpeg" }
 * "tipo" e o nome cru da Meta - e o que finalmente explica um "[anexo]".
 * "path" so existe quando o arquivo foi guardado; sem ele a tela mostra que
 * nao guardou, em vez de fingir que nao veio nada.
 */

alter table public.instagram_messages
  add column if not exists anexos jsonb not null default '[]'::jsonb;

comment on column public.instagram_messages.anexos is
  'Anexos do Direct: [{tipo, url, path, mime}]. path aponta para o acervo instagram-anexos; sem path, o arquivo nao foi guardado.';

-- O select da tabela para authenticated ja e da tabela inteira
-- (20261019130000), entao a coluna nova entra sem grant novo. Quem grava e so
-- o servidor (service_role, que ja tem update).

/**
 * Acervo dos anexos do Direct.
 *
 * PRIVADO pelo mesmo motivo do acervo do WhatsApp: no Direct tambem chega foto
 * de exame, de receita, de lesao. Quem ve recebe link temporario, gerado na
 * hora.
 *
 * 25 MB e o limite da propria Meta para anexo no Direct. A lista de tipos e
 * fechada (arquivo inesperado nao entra no acervo da clinica), mas mais larga
 * que a do WhatsApp: o Instagram manda audio em m4a/aac e video do iPhone em
 * mov. Tipo fora da lista nao trava nada - a mensagem fica com o link da Meta
 * e o aviso de que nao foi guardado.
 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'instagram-anexos',
  'instagram-anexos',
  false,
  26214400,
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
    'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm',
    'video/mp4', 'video/quicktime', 'video/webm', 'video/3gpp',
    'application/pdf'
  ]
)
on conflict (id) do nothing;

-- Caminho: <clinic_id>/<mid limpo>-<n>. A pasta e o id da clinica, e a leitura
-- pergunta o mesmo de sempre: "voce e membro desta clinica?".
drop policy if exists "membros leem os anexos do instagram da propria clinica" on storage.objects;
create policy "membros leem os anexos do instagram da propria clinica"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'instagram-anexos'
    and (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
    and private.is_clinic_member(((storage.foldername(name))[1])::uuid)
  );

-- Escrita sem policy: so o webhook grava, com service_role. O navegador subir
-- arquivo aqui seria plantar uma foto como se a pessoa tivesse mandado.

commit;

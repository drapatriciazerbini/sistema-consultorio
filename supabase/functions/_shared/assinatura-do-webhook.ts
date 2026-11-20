/**
 * Quem pode assinar o que chega ao meta-webhook (porte de 19/11/2026 do
 * sistema do Dr. Fabio, onde nasceu em 13/11/2026).
 *
 * A Meta assina cada aviso com a chave secreta do app que o entrega. Hoje o
 * numero da Dra. Patricia fala por um app (META_APP_SECRET) e o Direct do
 * Instagram por outro (INSTAGRAM_APP_SECRET, 01/10/2026). No dia em que o
 * numero for religado por coexistencia, os avisos dele passam a chegar
 * assinados pelo app da ECM, Provedor de Tecnologia (META_APP_SECRET_ECM).
 *
 * Vale a assinatura de qualquer um dos segredos que EXISTEM. Assim a troca de
 * um app para o outro nao tem hora em que o webhook recusa tudo, e o caminho
 * de volta (religar o numero na conta antiga) continua aceito.
 *
 * Sem o segredo META_APP_SECRET_ECM a lista e exatamente a de antes deste
 * porte: nada muda ate o dia. tests/assinatura-do-webhook.test.mjs confere.
 *
 * Fica fora do index.ts do webhook, sem Deno e sem rede, para poder ser
 * testado: o HMAC e a comparacao entram por parametro (sha256HmacHex e
 * safeEqual, de whatsapp.ts).
 */

type LerAmbiente = (nome: string) => string | undefined

/**
 * Os segredos que valem agora. Vazio = o webhook nao aceita nada.
 *
 * Um app da Meta para o WhatsApp e obrigatorio (o de hoje ou o da ECM): so
 * com o do Instagram a lista volta vazia, como sempre foi.
 */
export function segredosDoWebhook(ler: LerAmbiente): string[] {
  const limpo = (nome: string) => ler(nome)?.trim() || ''
  const doWhatsApp = [limpo('META_APP_SECRET'), limpo('META_APP_SECRET_ECM')].filter(Boolean)
  if (!doWhatsApp.length) return []
  return [...new Set([...doWhatsApp, limpo('INSTAGRAM_APP_SECRET')].filter(Boolean))]
}

/**
 * A assinatura do cabecalho x-hub-signature-256 bate com algum dos segredos?
 *
 * Confere todos, sem parar no primeiro que bate: o tempo da resposta nao
 * conta a ninguem qual dos apps assinou.
 */
export async function assinaturaConfere(
  segredos: string[],
  corpo: string,
  assinatura: string,
  hmac: (segredo: string, corpo: string) => Promise<string>,
  igual: (a: string, b: string) => boolean,
): Promise<boolean> {
  if (!assinatura.startsWith('sha256=')) return false
  let confere = false
  for (const segredo of segredos) {
    if (!segredo) continue
    if (igual(`sha256=${await hmac(segredo, corpo)}`, assinatura)) confere = true
  }
  return confere
}

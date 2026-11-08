/**
 * Bloquear um contato (07/11/2026, portado do sistema do Dr. Marcello, onde
 * nasceu no mesmo dia).
 *
 * La, um numero sem cadastro mandava "[unsupported]" (talvez ligacao pelo
 * WhatsApp) quase todo dia desde 22/10, e cada uma acendia a conversa e
 * avisava os celulares da equipe. Nao havia como fazer o numero parar. Aqui
 * vale para o mesmo tipo de numero: propaganda, engano insistente, golpe.
 *
 * O bloqueio tem duas camadas, porque a Meta so deixa bloquear quem escreveu
 * para a clinica nas ultimas 24 horas (erro 131047):
 *
 *  1. No WhatsApp (API block_users): o numero deixa de conseguir escrever e
 *     ligar para a clinica.
 *  2. Na Central (whatsapp_conversations.bloqueado_em): o que ainda chegar dele
 *     e ignorado no webhook - sem robo, sem etiqueta, sem aviso no celular.
 *
 * A segunda vale sempre. Quando a primeira foi recusada pelas 24 horas, o
 * webhook tenta de novo na proxima mensagem do numero, que e justamente
 * quando a Meta passa a aceitar.
 *
 * Funcoes sem banco nem rede aqui, para ter teste
 * (tests/bloqueio.test.mjs).
 */

export type ResultadoNoWhatsApp = { ok: true } | { ok: false; codigo: number | null; motivo: string }

type ErroDaMeta = { code?: unknown; message?: unknown; error_data?: { details?: unknown } }

/** O motivo em portugues, para a tela. O codigo cru vai junto no log. */
export function motivoDoErro(codigo: number | null, bloquear: boolean): string {
  switch (codigo) {
    case 131047:
      return bloquear
        ? 'O WhatsApp só deixa bloquear quem escreveu para a clínica nas últimas 24 horas.'
        : 'O WhatsApp não reconheceu este número.'
    case 131021:
      return 'Este é o número da própria clínica.'
    case 139101:
      return 'A lista de bloqueados do WhatsApp da clínica está cheia.'
    case 130429:
    case 139102:
    case 139103:
      return 'O WhatsApp está ocupado agora. Tente de novo em alguns minutos.'
    default:
      return codigo
        ? `O WhatsApp recusou (código ${codigo}).`
        : 'O WhatsApp não respondeu como esperado.'
  }
}

/**
 * Le a resposta da Meta ao bloquear (POST) ou desbloquear (DELETE).
 *
 * So conta como feito quando o numero aparece em added_users (bloqueio) ou
 * removed_users (desbloqueio). HTTP 200 sozinho nao basta: a Meta devolve 200
 * com o numero em failed_users quando falha so para ele.
 */
export function lerRespostaDaMeta(corpo: unknown, bloquear: boolean): ResultadoNoWhatsApp {
  const resposta = (corpo ?? {}) as {
    block_users?: { added_users?: unknown[]; removed_users?: unknown[]; failed_users?: { errors?: ErroDaMeta[] }[] }
    error?: ErroDaMeta
  }
  const lista = bloquear ? resposta.block_users?.added_users : resposta.block_users?.removed_users
  if (Array.isArray(lista) && lista.length > 0) return { ok: true }

  // O erro do proprio numero diz mais que o geral (139100, "falhou para
  // alguns"): e nele que vem o 131047 das 24 horas.
  const doNumero = resposta.block_users?.failed_users?.[0]?.errors?.[0]
  const erro = doNumero ?? resposta.error
  const codigo = Number(erro?.code)
  const codigoValido = Number.isFinite(codigo) && codigo > 0 ? codigo : null
  return { ok: false, codigo: codigoValido, motivo: motivoDoErro(codigoValido, bloquear) }
}

/** O pedido a Meta. Numero com +, como no exemplo da documentacao. */
export function pedidoDoBloqueio(waId: string) {
  return {
    messaging_product: 'whatsapp',
    block_users: [{ user: `+${waId.replace(/\D/g, '')}` }],
  }
}

/**
 * Bloqueia ou desbloqueia o numero no WhatsApp da clinica. Nunca lanca: falha
 * de rede volta como { ok: false }, e quem chamou decide o que mostrar.
 */
export async function bloquearNoWhatsApp(p: {
  fetch: (url: string, init: RequestInit) => Promise<Response>
  versao: string
  phoneNumberId: string
  token: string
  waId: string
  bloquear: boolean
}): Promise<ResultadoNoWhatsApp> {
  try {
    const resposta = await p.fetch(`https://graph.facebook.com/${p.versao}/${p.phoneNumberId}/block_users`, {
      method: p.bloquear ? 'POST' : 'DELETE',
      headers: { Authorization: `Bearer ${p.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(pedidoDoBloqueio(p.waId)),
    })
    const corpo = await resposta.json().catch(() => null)
    const resultado = lerRespostaDaMeta(corpo, p.bloquear)
    if (!resultado.ok) console.warn('Meta recusou o', p.bloquear ? 'bloqueio' : 'desbloqueio', resposta.status, JSON.stringify(corpo))
    return resultado
  } catch (erro) {
    console.warn('Nao consegui falar com a Meta para o bloqueio', erro)
    return { ok: false, codigo: null, motivo: 'Não consegui falar com o WhatsApp. Tente de novo.' }
  }
}

export type BloqueioDoContato = { conversaId: string; noWhatsApp: boolean }

/**
 * O numero esta bloqueado na Central? Para o webhook, antes de qualquer outra
 * coisa com a mensagem.
 *
 * `linhas` sao as conversas do numero (todas as grafias, com e sem o nono
 * digito) que tem bloqueado_em. A coluna e nova: se a consulta falhar, a
 * mensagem segue como antes - perder o bloqueio e arranhao, perder a mensagem
 * de um paciente nao - e o log diz por que.
 */
export async function conferirBloqueio(
  consultar: () => Promise<{ id: string; bloqueado_no_whatsapp?: boolean | null }[]>,
): Promise<BloqueioDoContato | null> {
  try {
    const linhas = await consultar()
    const linha = linhas[0]
    if (!linha) return null
    return { conversaId: linha.id, noWhatsApp: Boolean(linha.bloqueado_no_whatsapp) }
  } catch (erro) {
    console.warn('Sem whatsapp_conversations.bloqueado_em; a mensagem segue sem conferir bloqueio', erro)
    return null
  }
}

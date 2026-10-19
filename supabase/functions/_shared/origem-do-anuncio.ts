/**
 * De onde a familia veio: Google, anuncio do Instagram ou do Facebook
 * (19/10/2026, portado do sistema do Dr. Marcello).
 *
 * Pedido do Edu: "tem como saber quem veio pelo Google?". Nao tinha: a
 * conversa chegava igual a qualquer outra.
 *
 * Dois sinais, nesta ordem:
 *
 *   1. `referral` - o bloco que a Meta poe na PRIMEIRA mensagem de quem tocou
 *      no botao de WhatsApp de um anuncio ou post. E o sinal certo; o
 *      source_url diz se foi Instagram ou Facebook. Quando a Meta manda um link
 *      curto (fb.me) que nao diz qual dos dois, fica 'meta' - melhor admitir
 *      que nao sabe do que chutar.
 *   2. A frase pronta "Encontrei a Dra. Patricia no Google", que o site poe no
 *      botao de WhatsApp de quem chegou pelo Google (anuncio com gclid, ou
 *      busca do Google como pagina de origem). O Google nao manda aviso
 *      escondido como o referral da Meta: se a pessoa apagar a frase, ela nao
 *      entra na conta.
 */

export type OrigemDoAnuncio = 'instagram' | 'facebook' | 'meta' | 'google'

/** O bloco `referral` da mensagem recebida, como a Meta manda. */
export type Indicacao = {
  source_url?: string
  source_type?: string
  source_id?: string
  headline?: string
  body?: string
  ctwa_clid?: string
}

export type OrigemEncontrada = {
  origem: OrigemDoAnuncio
  /** Titulo do anuncio, quando a Meta manda - ajuda a saber qual peca trouxe. */
  titulo: string | null
  /** O link cru, para conferir depois se a classificacao bateu. */
  url: string | null
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function plataformaDoLink(url: string): OrigemDoAnuncio {
  let host = ''
  try {
    host = new URL(url).hostname.toLowerCase()
  } catch {
    host = url.toLowerCase()
  }
  if (/(^|\.)instagram\.com$|(^|\.)instagr\.am$/.test(host)) return 'instagram'
  if (/(^|\.)facebook\.com$|(^|\.)fb\.com$/.test(host)) return 'facebook'
  return 'meta'
}

export function origemDoAnuncio(indicacao: Indicacao | null | undefined, texto: string): OrigemEncontrada | null {
  if (indicacao && typeof indicacao === 'object' && (indicacao.source_url || indicacao.source_id || indicacao.ctwa_clid)) {
    const url = String(indicacao.source_url ?? '').trim()
    const titulo = String(indicacao.headline ?? '').trim().slice(0, 160) || null
    return { origem: url ? plataformaDoLink(url) : 'meta', titulo, url: url ? url.slice(0, 500) : null }
  }
  const limpo = semAcento(texto ?? '')
  if (/encontrei a (dra\.? )?patricia( zerbini)? no google/.test(limpo)) return { origem: 'google', titulo: null, url: null }
  return null
}

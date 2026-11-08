/**
 * Gasto do Google Ads sem ninguem digitar (07/11/2026, portado do sistema do
 * Dr. Marcello, onde entrou em 05/11).
 *
 * Sem o script, o gasto do Google e lancado a mao, por mes, na aba Campanha. A
 * API do Google Ads exige um token de desenvolvedor aprovado pelo Google
 * (semanas, formulario, conta de administrador); para uma conta so nao compensa.
 *
 * O caminho: um script do proprio Google Ads (Ferramentas > Scripts), rodando
 * de hora em hora DENTRO da conta, le o custo por dia e por campanha e manda
 * para a funcao gastos-google com uma chave que so a Central conhece. Quem cola
 * o script e autoriza e o Edu; a chave sai da tela, uma vez, ja dentro do
 * script.
 *
 * Estas contas ficam aqui, sem import nem Deno, para os testes rodarem no Node
 * (tests/gastos-google.test.mjs) - inclusive o script gerado, que o teste
 * executa contra um Google Ads de mentira.
 */

/** Primeiro dia que o script le: o Google da Dra. ja tinha gasto em setembro de 2026. */
export const DESDE_GOOGLE = '2026-09-01'

/** O script roda de hora em hora: sem noticia por mais que isso, a tela avisa; por mais de um dia, grita. */
export const AVISAR_DEPOIS_HORAS = 3
export const ERRO_DEPOIS_HORAS = 26

/** Maior corpo aceito: ~13 meses de dias por ~30 campanhas cabe com folga. */
export const MAIOR_CORPO = 1_000_000

export type RelatorioDoGoogle = {
  conta: string | null
  moeda: string | null
  /** Primeiro dia lido pelo script: dai em diante o valor lancado a mao deixa de valer. */
  desde: string
  ate: string
  /** "2026-11-03": custo do dia em reais, igual a coluna Custo do Google Ads. */
  dias: Record<string, number>
  campanhas: Record<string, { nome: string; dias: Record<string, number> }>
}

const centavos = (n: number) => Math.round(n * 100) / 100
// Data de verdade: o Date do JavaScript aceita 30/02 e vira 02/03 sem avisar
const ehDia = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = Date.parse(`${v}T12:00:00Z`)
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v
}

/** Dias com valor: so data valida e numero >= 0; dia zerado nao vai para o banco. */
function limparDias(bruto: unknown): { ok: true; dias: Record<string, number> } | { ok: false; erro: string } {
  if (bruto === undefined || bruto === null) return { ok: true, dias: {} }
  if (typeof bruto !== 'object' || Array.isArray(bruto)) return { ok: false, erro: 'dias precisa ser um objeto {"2026-11-03": 12.5}' }
  const entradas = Object.entries(bruto as Record<string, unknown>)
  if (entradas.length > 800) return { ok: false, erro: 'dias demais no relatorio' }
  const dias: Record<string, number> = {}
  for (const [dia, valor] of entradas) {
    if (!ehDia(dia)) return { ok: false, erro: `dia invalido: ${String(dia).slice(0, 20)}` }
    const n = Number(valor)
    if (!Number.isFinite(n) || n < 0 || n > 100_000) return { ok: false, erro: `valor invalido em ${dia}` }
    if (n > 0) dias[dia] = centavos(n)
  }
  return { ok: true, dias }
}

/**
 * Confere o que o script mandou antes de gravar. Recusa em vez de consertar:
 * um relatorio estranho grava o erro na tela e os numeros antigos ficam.
 */
export function validarRelatorio(corpo: unknown): { ok: true; relatorio: RelatorioDoGoogle } | { ok: false; erro: string } {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) return { ok: false, erro: 'corpo vazio' }
  const c = corpo as Record<string, unknown>
  // A conta da Dra. e em reais; outra moeda somaria laranja com banana.
  const moeda = c.moeda === undefined || c.moeda === null ? null : String(c.moeda).trim().toUpperCase()
  if (moeda && moeda !== 'BRL') return { ok: false, erro: `a conta do Google esta em ${moeda}, e a Central soma em reais` }
  if (!ehDia(c.desde)) return { ok: false, erro: 'falta o primeiro dia lido (desde)' }
  if (!ehDia(c.ate)) return { ok: false, erro: 'falta o ultimo dia lido (ate)' }
  if (c.desde > c.ate) return { ok: false, erro: 'desde depois de ate' }
  const dias = limparDias(c.dias)
  if (!dias.ok) return dias
  const campanhas: RelatorioDoGoogle['campanhas'] = {}
  if (c.campanhas !== undefined && c.campanhas !== null) {
    if (typeof c.campanhas !== 'object' || Array.isArray(c.campanhas)) return { ok: false, erro: 'campanhas precisa ser um objeto' }
    const lista = Object.entries(c.campanhas as Record<string, unknown>)
    if (lista.length > 200) return { ok: false, erro: 'campanhas demais no relatorio' }
    for (const [id, bruto] of lista) {
      const camp = (bruto ?? {}) as { nome?: unknown; dias?: unknown }
      const d = limparDias(camp.dias)
      if (!d.ok) return { ok: false, erro: `campanha ${id.slice(0, 20)}: ${d.erro}` }
      if (!Object.keys(d.dias).length) continue
      campanhas[id.slice(0, 40)] = { nome: String(camp.nome ?? '').trim().slice(0, 200) || 'Campanha sem nome', dias: d.dias }
    }
  }
  const conta = c.conta === undefined || c.conta === null ? null : String(c.conta).replace(/[^\d-]/g, '').slice(0, 20) || null
  return { ok: true, relatorio: { conta, moeda, desde: c.desde, ate: c.ate, dias: dias.dias, campanhas } }
}

/** Erro que o proprio script avisa (a busca no Google falhou la dentro). */
export function erroDoScript(corpo: unknown): string | null {
  if (!corpo || typeof corpo !== 'object') return null
  const e = (corpo as { erro?: unknown }).erro
  return typeof e === 'string' && e.trim() ? e.trim().slice(0, 500) : null
}

/** Chave nova: 32 bytes aleatorios em base64url (vai dentro do script, nunca de volta para a tela). */
export function novaChave(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** O banco guarda so o sha-256 da chave: quem le a tabela nao consegue mandar gasto falso. */
export async function hashDaChave(chave: string): Promise<string> {
  const dados = new TextEncoder().encode(chave.trim())
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', dados))
  return [...resumo].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * O script que o Edu cola no Google Ads (Ferramentas > Acoes em massa >
 * Scripts). Roda dentro da conta, com a permissao que o proprio Edu da ao
 * autorizar. Le o custo por dia e por campanha desde DESDE e manda tudo de uma
 * vez (o Google ainda ajusta dias passados, como a Meta). Se a Central recusar,
 * o script falha de proposito: o Google manda e-mail de "script com erro" ao
 * dono, e a aba Campanha mostra o atraso.
 */
export function scriptDoGoogleAds({ url, chave, desde = DESDE_GOOGLE }: { url: string; chave: string; desde?: string }): string {
  return `/**
 * Central de Cuidado - gasto do Google Ads para a aba Campanha.
 * Programar: de hora em hora. Nao altera nada na conta: so le o custo.
 * Gerado em ${new Date().toLocaleDateString('pt-BR')}. Gerar outra chave na Central desliga esta.
 */
var CENTRAL = ${JSON.stringify(url)};
var CHAVE = ${JSON.stringify(chave)};
var DESDE = ${JSON.stringify(desde)};

function main() {
  var conta = AdsApp.currentAccount();
  var hoje = Utilities.formatDate(new Date(), conta.getTimeZone(), 'yyyy-MM-dd');
  var corpo = { conta: conta.getCustomerId(), moeda: conta.getCurrencyCode(), desde: DESDE, ate: hoje, dias: {}, campanhas: {} };
  try {
    var linhas = AdsApp.search(
      "SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros FROM campaign " +
      "WHERE segments.date BETWEEN '" + DESDE + "' AND '" + hoje + "'"
    );
    while (linhas.hasNext()) {
      var l = linhas.next();
      var dia = l.segments.date;
      var custo = Number(l.metrics.costMicros || 0) / 1000000;
      if (!custo) continue;
      corpo.dias[dia] = Math.round(((corpo.dias[dia] || 0) + custo) * 100) / 100;
      var id = String(l.campaign.id);
      var c = corpo.campanhas[id] || (corpo.campanhas[id] = { nome: l.campaign.name, dias: {} });
      c.dias[dia] = Math.round(((c.dias[dia] || 0) + custo) * 100) / 100;
    }
  } catch (e) {
    enviar({ erro: 'O script nao conseguiu ler o custo no Google Ads: ' + e });
    throw e;
  }
  var resposta = enviar(corpo);
  Logger.log('Central: ' + resposta);
}

function enviar(corpo) {
  var r = UrlFetchApp.fetch(CENTRAL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-chave-google': CHAVE },
    payload: JSON.stringify(corpo),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) {
    throw new Error('A Central recusou o gasto (' + r.getResponseCode() + '): ' + r.getContentText());
  }
  return r.getContentText();
}
`
}

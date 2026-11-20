/**
 * Concluir a ligacao de um numero do WhatsApp a clinica (porte de 19/11/2026
 * do sistema do Dr. Fabio, onde nasceu em 13/11/2026).
 *
 * A ECM virou Provedor de Tecnologia em 12/11/2026. O consultorio passa pelo
 * cadastro da Meta (link hospedado, com coexistencia), le o QR code no app
 * WhatsApp Business e a conta dele fica compartilhada com a ECM. O cadastro
 * hospedado termina ali, sem devolver nada ao sistema. Falta o que so o
 * sistema faz, e e disso que a funcao whatsapp-conectar cuida:
 *
 *  1. conferir que o numero e mesmo da conta informada;
 *  2. assinar os avisos da conta (subscribed_apps), sem o que o webhook nao
 *     recebe nada dela;
 *  3. pedir os contatos e o historico do celular (smb_app_data). A Meta so
 *     aceita o pedido nas 24 horas seguintes ao QR code, e uma vez so;
 *  4. gravar o numero e a conta na clinica.
 *
 * Aqui ficam as regras, sem rede e sem banco, para poderem ser testadas.
 *
 * Na Central da Dra. Patricia nada disto roda ate o dia da troca: a funcao so
 * age quando o responsavel a chama, com a conta e o numero novos na mao.
 */

export type Acao = 'listar' | 'conectar'

export type Pedido =
  | { ok: true; acao: 'listar'; clinicId: string | null; phoneNumberId: string | null }
  | { ok: true; acao: 'conectar'; clinicId: string | null; wabaId: string; phoneNumberId: string; sincronizar: boolean }
  | { ok: false; erro: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Identificador da Meta: so algarismos. Vai dentro do endereco da chamada. */
export function idValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{5,25}$/.test(valor)
}

export function lerPedido(corpo: unknown): Pedido {
  const c = (corpo ?? {}) as Record<string, unknown>
  const acao = c.acao ?? 'listar'
  // A clinica so precisa vir quando a pessoa responde por mais de uma (a de
  // verdade e a de teste, por exemplo). Ver clinicaDoResponsavel.
  const clinica = c.clinic_id === undefined || c.clinic_id === null ? '' : String(c.clinic_id).trim()
  if (clinica && !UUID.test(clinica)) return { ok: false, erro: 'Clínica inválida.' }
  const clinicId = clinica || null
  if (acao === 'listar') {
    // O numero e opcional na lista: serve so para escolher a chave dele.
    const doNumero = c.phone_number_id === undefined || c.phone_number_id === null ? '' : String(c.phone_number_id).trim()
    if (doNumero && !idValido(doNumero)) return { ok: false, erro: 'Informe o número do WhatsApp (só números).' }
    return { ok: true, acao: 'listar', clinicId, phoneNumberId: doNumero || null }
  }
  if (acao !== 'conectar') return { ok: false, erro: 'Ação desconhecida.' }

  const wabaId = String(c.waba_id ?? '').trim()
  const phoneNumberId = String(c.phone_number_id ?? '').trim()
  if (!idValido(wabaId)) return { ok: false, erro: 'Informe a conta do WhatsApp (só números).' }
  if (!idValido(phoneNumberId)) return { ok: false, erro: 'Informe o número do WhatsApp (só números).' }
  // So o "false" escrito desliga: esquecer o campo nao pode custar o
  // historico, que a Meta entrega uma vez so.
  return { ok: true, acao: 'conectar', clinicId, wabaId, phoneNumberId, sincronizar: c.sincronizar !== false }
}

/**
 * De qual clinica a pessoa e responsavel (owner)?
 *
 * `vinculos` sao as linhas ATIVAS de clinic_memberships DESTA pessoa, lidas
 * pelo servidor com o id dela (como o gastos-meta faz). Na origem a conferencia
 * era pela sessao, sem o id: onde um membro enxerga a linha do dono, a
 * secretaria passaria por responsavel. Aqui so vale a linha da propria pessoa.
 *
 * Trocar o numero muda por onde a clinica inteira fala: so o responsavel.
 */
export function clinicaDoResponsavel(
  vinculos: { clinic_id?: unknown; role?: unknown }[] | null | undefined,
  pedida: string | null,
): { ok: true; clinicId: string } | { ok: false; status: number; code: string; erro: string } {
  const todas = (vinculos ?? []).filter((v) => typeof v?.clinic_id === 'string' && v.clinic_id)
  const minhas = todas.filter((v) => v.role === 'owner').map((v) => String(v.clinic_id))
  const recusa = {
    ok: false as const,
    status: 403,
    code: 'SO_RESPONSAVEL',
    erro: 'Só o responsável pela clínica liga um número do WhatsApp.',
  }
  if (pedida) return minhas.includes(pedida) ? { ok: true, clinicId: pedida } : recusa
  if (minhas.length === 1) return { ok: true, clinicId: minhas[0] }
  if (!minhas.length) return recusa
  return {
    ok: false,
    status: 400,
    code: 'QUAL_CLINICA',
    erro: 'Você responde por mais de uma clínica: informe clinic_id.',
  }
}

type LerAmbiente = (nome: string) => string | undefined

/**
 * O desvio do webhook para o meta-webhook DESTE projeto.
 *
 * O app da ECM tem um endereco de webhook so, e cada consultorio tem o seu
 * banco. Com o segredo WHATSAPP_WEBHOOK_PROPRIO=sim, a assinatura dos avisos
 * (subscribed_apps) manda a Meta entregar os desta conta no meta-webhook do
 * projeto onde a funcao esta rodando. O endereco sai de SUPABASE_URL, que o
 * proprio Supabase preenche: nao ha id de projeto escrito no codigo, e nao ha
 * como desviar para o banco de outro consultorio por engano.
 *
 * Sem o segredo, nao ha desvio: os avisos iriam para o endereco do app, que
 * nao e a Central da Dra. Patricia. Por isso a funcao avisa na resposta.
 */
export function desvioDoWebhook(
  ler: LerAmbiente,
): { ok: true; desvio: { override_callback_uri: string; verify_token: string } | null } | { ok: false; erro: string } {
  if ((ler('WHATSAPP_WEBHOOK_PROPRIO') ?? '').trim().toLowerCase() !== 'sim') return { ok: true, desvio: null }
  const projeto = (ler('SUPABASE_URL') ?? '').trim().replace(/\/+$/, '')
  const senha = (ler('WHATSAPP_VERIFY_TOKEN') ?? '').trim()
  if (!projeto.startsWith('https://')) return { ok: false, erro: 'Falta o endereço do projeto (SUPABASE_URL) para desviar o webhook.' }
  if (!senha) return { ok: false, erro: 'Falta o WHATSAPP_VERIFY_TOKEN para desviar o webhook.' }
  return { ok: true, desvio: { override_callback_uri: `${projeto}/functions/v1/meta-webhook`, verify_token: senha } }
}

/** O motivo que a Meta deu, em uma linha, para a resposta de erro. */
export function motivoDaMeta(resposta: unknown): string {
  const erro = (resposta as { error?: Record<string, unknown> } | null)?.error
  if (!erro) return 'A Meta não explicou o motivo.'
  const partes = [erro.error_user_title, erro.error_user_msg].filter(
    (p): p is string => typeof p === 'string' && p.trim() !== '',
  )
  if (partes.length) return partes.join(': ')
  return typeof erro.message === 'string' && erro.message ? erro.message : 'A Meta não explicou o motivo.'
}

export type NumeroDaConta = {
  id: string
  numero: string
  nome: string
  /** O numero esta no app WhatsApp Business (coexistencia)? */
  noApp: boolean
}

export type ContaCompartilhada = { wabaId: string; nome: string; numeros: NumeroDaConta[] }

function lista(valor: unknown): Record<string, unknown>[] {
  const dados = (valor as { data?: unknown } | null)?.data
  return Array.isArray(dados) ? (dados as Record<string, unknown>[]) : []
}

/** Os numeros de uma conta, como a Meta devolve em /phone_numbers. */
export function lerNumeros(resposta: unknown): NumeroDaConta[] {
  return lista(resposta)
    .filter((n) => idValido(String(n.id ?? '')))
    .map((n) => ({
      id: String(n.id),
      numero: String(n.display_phone_number ?? ''),
      nome: String(n.verified_name ?? ''),
      noApp: n.is_on_biz_app === true,
    }))
}

/** As contas que os consultorios compartilharam com a ECM. */
export function lerContas(resposta: unknown): ContaCompartilhada[] {
  return lista(resposta)
    .filter((c) => idValido(String(c.id ?? '')))
    .map((c) => ({
      wabaId: String(c.id),
      nome: String(c.name ?? ''),
      numeros: lerNumeros(c.phone_numbers),
    }))
}

/** O numero pedido, se for mesmo daquela conta. */
export function numeroDaConta(numeros: NumeroDaConta[], phoneNumberId: string): NumeroDaConta | null {
  return numeros.find((n) => n.id === phoneNumberId) ?? null
}

export type Passo = { passo: string; ok: boolean; motivo?: string }

/** Os dois pedidos ao celular, na ordem que a Meta manda: contatos, depois conversas. */
export const SINCRONIAS = [
  { tipo: 'smb_app_state_sync', passo: 'Contatos do celular' },
  { tipo: 'history', passo: 'Histórico de conversas' },
] as const

/**
 * A ligacao valeu? Conferir o numero e assinar os avisos sao obrigatorios:
 * sem eles a clinica ficaria com um numero mudo. O historico e os contatos
 * podem falhar (numero que nao esta no app, prazo de 24 horas vencido) sem
 * impedir o uso.
 */
export function ligacaoValeu(passos: Passo[]): boolean {
  const obrigatorios = ['Número da conta', 'Avisos da conta']
  return obrigatorios.every((nome) => passos.some((p) => p.passo === nome && p.ok))
}

import { useEffect, useState } from 'react'
import { Bot, Check, RefreshCw, Save } from 'lucide-react'
import {
  getAtendenteIA,
  getConhecimentoIA,
  getUsoDaIA,
  saveAtendenteIA,
  saveConhecimentoIA,
  type ModoDoAtendenteIA,
  type UsoDaIA,
} from '@/lib/atendente-com-ia'

/**
 * Cartao "Atendente com IA" em Preferencias (porte de 28/10/2026, sistema do
 * Dr. Marcello, 15/10/2026). Ver supabase/functions/_shared/assistente.ts para
 * o que cada modo faz.
 *
 * Desligado e o padrao e a saida de emergencia: um toque e o robo de sempre
 * volta a responder tudo, na mensagem seguinte.
 */
const MODOS: { id: ModoDoAtendenteIA; titulo: string; texto: string }[] = [
  {
    id: 'desligado',
    titulo: 'Desligado',
    texto: 'O robô de sempre responde tudo. Nenhuma mensagem passa pela IA.',
  },
  {
    id: 'sombra',
    titulo: 'Sombra',
    texto:
      'O robô continua respondendo. A IA escreve, como nota interna em cada conversa, o que ela responderia. O paciente não vê. Bom para comparar.',
  },
  {
    id: 'ligado',
    titulo: 'Ligado',
    texto:
      'A IA conversa com os pacientes e familiares. Pedido de consulta, visita, remarcar, cancelar e 2ª via continuam pelos passos do robô, com o valor antes do nome. Foto e "é urgente" ficam com o robô; conduta médica vai para a equipe.',
  },
]

// O texto inteiro vai a cada mensagem: texto grande custa em toda conversa.
const MAXIMO_DO_CONHECIMENTO = 6000

function quando(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function AtendenteComIA({ clinicId }: { clinicId: string | null }) {
  const [modo, setModo] = useState<ModoDoAtendenteIA | null>(null)
  const [carregado, setCarregado] = useState(false)
  const [indisponivel, setIndisponivel] = useState(false)
  const [conhecimento, setConhecimento] = useState<string | null>(null)
  const [salvo, setSalvo] = useState('')
  const [uso, setUso] = useState<UsoDaIA | null>(null)
  const [ocupado, setOcupado] = useState<'' | 'modo' | 'texto'>('')
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  useEffect(() => {
    if (!clinicId) return
    let vivo = true
    void getAtendenteIA(clinicId).then((atual) => {
      if (!vivo) return
      setCarregado(true)
      if (atual === null) setIndisponivel(true)
      else setModo(atual)
    })
    void getConhecimentoIA(clinicId).then((texto) => {
      if (!vivo || texto === null) return
      setConhecimento(texto)
      setSalvo(texto)
    })
    void getUsoDaIA(clinicId).then((linha) => {
      if (vivo) setUso(linha)
    })
    return () => {
      vivo = false
    }
  }, [clinicId])

  async function escolher(novo: ModoDoAtendenteIA) {
    if (!clinicId || novo === modo) return
    setAviso(null)
    setOcupado('modo')
    try {
      await saveAtendenteIA(clinicId, novo)
      setModo(novo)
      setAviso({
        tipo: 'ok',
        texto: novo === 'desligado' ? 'IA desligada: o robô de sempre responde.' : `Atendente com IA: ${novo}. Vale a partir da próxima mensagem.`,
      })
    } catch (causa) {
      setAviso({ tipo: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível mudar o modo.' })
    } finally {
      setOcupado('')
    }
  }

  async function salvarConhecimento() {
    if (!clinicId || conhecimento === null) return
    setAviso(null)
    setOcupado('texto')
    try {
      await saveConhecimentoIA(clinicId, conhecimento)
      setSalvo(conhecimento)
      setAviso({ tipo: 'ok', texto: 'Texto salvo: vale a partir da próxima mensagem.' })
    } catch (causa) {
      setAviso({ tipo: 'erro', texto: causa instanceof Error ? causa.message : 'Não foi possível salvar o texto.' })
    } finally {
      setOcupado('')
    }
  }

  const ligadaOuSombra = modo === 'ligado' || modo === 'sombra'

  return (
    <section className="surface-card overflow-hidden rounded-[26px]">
      <div className="border-b border-[#193d36]/[0.06] bg-gradient-to-r from-white to-[#f9f8f3] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#eae3d4] text-[#1f5f55]">
            <Bot className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-[#1f5f55]">WhatsApp</p>
            <h2 className="mt-1 text-base font-extrabold text-[#193d36]">Atendente com IA</h2>
            <p className="mt-1 text-xs leading-relaxed text-[#4d6b63]">
              Responde no WhatsApp usando só o que está nos textos dos atendimentos, nas respostas prontas e no texto abaixo.
              Mensagens escritas por ela aparecem com 🤖 na conversa. Se a IA falhar, o robô responde.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-5 sm:p-6">
        {!carregado ? (
          <p className="text-[11px] font-bold text-[#4d6b63]">Consultando…</p>
        ) : indisponivel ? (
          <p className="rounded-2xl bg-[#f7f4ee] p-4 text-xs leading-relaxed text-[#6b5a3a]">
            Ainda não disponível: a atualização do banco não chegou. Depois do próximo PUBLICAR, recarregue a página.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-3">
            {MODOS.map((m) => {
              const ativo = modo === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  disabled={ocupado !== '' || modo === null}
                  onClick={() => void escolher(m.id)}
                  className={`rounded-[18px] border p-3.5 text-left transition disabled:opacity-60 ${
                    ativo ? 'border-[#193d36] bg-[#193d36] text-white' : 'border-[#193d36]/10 bg-white hover:border-[#2f7f74]/40'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-extrabold">
                    {ativo && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    {m.titulo}
                  </span>
                  <span className={`mt-1 block text-[10px] leading-relaxed ${ativo ? 'text-white/70' : 'text-[#4d6b63]'}`}>
                    {m.texto}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Falha que so existe no log e falha calada: aqui ela aparece, com o motivo. */}
        {ligadaOuSombra && uso && (
          <p className={`text-[10px] font-bold leading-relaxed ${uso.falhas ? 'text-red-600' : 'text-[#4d6b63]'}`}>
            Últimos 7 dias: {uso.respostas} resposta(s) da IA
            {uso.falhas
              ? `, ${uso.falhas} falha(s) em que o robô respondeu no lugar. Última: ${quando(uso.ultimaFalha?.quando ?? '')}${uso.ultimaFalha?.detalhe ? ` (${uso.ultimaFalha.detalhe})` : ''}.`
              : ', nenhuma falha.'}
          </p>
        )}

        {conhecimento !== null && (
          <div className="rounded-[18px] border border-[#193d36]/10 bg-white p-3.5">
            <label htmlFor="conhecimento-ia" className="text-xs font-extrabold text-[#193d36]">
              O que a IA sabe do consultório
            </label>
            <p className="mt-1 text-[10px] leading-relaxed text-[#4d6b63]">
              Além dos textos dos atendimentos e das respostas prontas: quem é a Dra., quem ela atende, como é a consulta.
              A IA só afirma o que está escrito aqui ou nesses textos. Valor e convênio ficam nas respostas prontas.
            </p>
            <textarea
              id="conhecimento-ia"
              value={conhecimento}
              maxLength={MAXIMO_DO_CONHECIMENTO}
              onChange={(e) => setConhecimento(e.target.value)}
              rows={9}
              className="mt-2 w-full resize-y rounded-[14px] border border-[#193d36]/10 bg-[#f8f6f0] p-3 text-xs leading-relaxed text-[#193d36] outline-none focus:border-[#2f7f74]/50"
            />
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">
                {conhecimento.length} / {MAXIMO_DO_CONHECIMENTO}
              </span>
              <button
                type="button"
                disabled={ocupado !== '' || conhecimento === salvo}
                onClick={() => void salvarConhecimento()}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#193d36] px-3 py-2 text-[11px] font-extrabold text-white transition hover:bg-[#13453c] disabled:opacity-50"
              >
                {ocupado === 'texto' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                Salvar texto
              </button>
            </div>
          </div>
        )}

        {aviso && (
          <p className={`text-[11px] font-bold leading-relaxed ${aviso.tipo === 'ok' ? 'text-[#1c6b3a]' : 'text-red-600'}`}>
            {aviso.texto}
          </p>
        )}

        <p className="text-[10px] leading-relaxed text-slate-400">
          Precisa da chave da API da Anthropic cadastrada nos segredos das funções do Supabase, com o nome{' '}
          <strong>ANTHROPIC_API_KEY</strong>. Sem a chave, mesmo ligado, o robô de sempre responde. Urgência com risco de vida
          recebe resposta pronta (pronto-socorro ou 192) e marca a conversa como urgente; o pedido de consulta continua
          avisando o WhatsApp da Dra.
        </p>
      </div>
    </section>
  )
}

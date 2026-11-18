import { useState } from 'react'
import { Link2, Search } from 'lucide-react'
import type { Patient } from '@/types/patient'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useVoltarDoCelular } from '@/lib/voltar-do-celular'
import { procurarPacientes } from '@/lib/procurar-paciente'
import { mascararTelefone } from '@/lib/mascaras'
import { ligarTelefoneAoPaciente } from '@/lib/repository'
import { QUEM_E_O_TELEFONE } from '../../supabase/functions/_shared/telefones-do-paciente.ts'

/**
 * "Ja e de um paciente cadastrado": liga o numero da conversa a um cadastro
 * que ja existe, como segundo telefone (porte de 18/11/2026, do sistema do
 * Dr. Marcello, la desde 13/11/2026).
 *
 * O caso de la: uma pessoa da familia marcou a consulta pelo celular dela, e
 * outra escrevia de outro numero. A conversa aparecia como "Contato sem
 * cadastro", e a unica saida era cadastrar o paciente de novo. Aqui e o dia a
 * dia: o cadastro tem o celular do idoso ou de uma filha, e quem escreve e
 * outro filho, o conjuge ou o cuidador. A equipe diz de quem e o numero; o
 * telefone do cadastro nao muda e continua sendo o que recebe lembrete.
 */
export default function LigarTelefone({
  conversa,
  pacientes,
  onFechar,
  onLigado,
}: {
  /** null = fechado. */
  conversa: { id: string; phone: string; profileName: string } | null
  pacientes: Patient[]
  onFechar: () => void
  onLigado: (paciente: Patient, quemE: string) => void
}) {
  useVoltarDoCelular(conversa !== null, onFechar)
  return (
    <Dialog open={conversa !== null}>
      {conversa && <Aberto key={conversa.id} conversa={conversa} pacientes={pacientes} onFechar={onFechar} onLigado={onLigado} />}
    </Dialog>
  )
}

function Aberto({
  conversa,
  pacientes,
  onFechar,
  onLigado,
}: {
  conversa: { id: string; phone: string; profileName: string }
  pacientes: Patient[]
  onFechar: () => void
  onLigado: (paciente: Patient, quemE: string) => void
}) {
  const [termo, setTermo] = useState('')
  const [escolhido, setEscolhido] = useState<Patient | null>(null)
  const [quem, setQuem] = useState<string>(QUEM_E_O_TELEFONE[0])
  const [ligando, setLigando] = useState(false)
  const [erro, setErro] = useState('')
  const achados = procurarPacientes(pacientes, termo)

  async function ligar() {
    if (!escolhido || ligando) return
    setLigando(true)
    setErro('')
    try {
      await ligarTelefoneAoPaciente(conversa.id, escolhido.id, quem)
      onLigado(escolhido, quem)
    } catch (causa) {
      // Falha fica na tela: fechar calado deixaria a equipe achando que ligou.
      console.warn('Nao consegui ligar o numero ao cadastro', causa)
      setErro(causa instanceof Error ? causa.message : 'Não foi possível ligar o número ao cadastro.')
    } finally {
      setLigando(false)
    }
  }

  return (
    <DialogContent
      onEscapeKeyDown={(e) => {
        e.preventDefault()
        onFechar()
      }}
      onInteractOutside={(e) => {
        e.preventDefault()
        onFechar()
      }}
      onCloseAutoFocus={(e) => e.preventDefault()}
      showCloseButton={false}
      className="max-w-[520px] rounded-[20px] p-5"
    >
      <DialogTitle className="text-[15px] font-extrabold text-[#193d36]">Este número já é de um paciente cadastrado</DialogTitle>
      <DialogDescription className="text-[11.5px] leading-relaxed text-slate-600">
        {mascararTelefone(conversa.phone) || conversa.phone}
        {conversa.profileName ? ` (${conversa.profileName})` : ''} passa a ser reconhecido como da família ou do cuidador do
        paciente escolhido. O telefone do cadastro não muda: lembrete e acompanhamento continuam indo para ele.
      </DialogDescription>

      {!escolhido ? (
        <div className="mt-1">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome do paciente ou do acompanhante"
              aria-label="Nome do paciente ou do acompanhante"
              className="w-full rounded-[12px] border border-[#193d36]/15 bg-white py-2.5 pl-9 pr-3 text-[12px] outline-none focus:border-[#2f7f74]"
            />
          </label>
          <div className="mt-2 max-h-[260px] overflow-y-auto">
            {termo.trim().length >= 2 && achados.length === 0 && (
              <p className="px-1 py-3 text-[11px] font-semibold text-slate-500">
                Nenhum paciente com esse nome. Se a pessoa ainda não tem cadastro, use &quot;Cadastrar como paciente&quot;.
              </p>
            )}
            {achados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setEscolhido(p)}
                className="flex w-full items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition hover:bg-[#eef3f2]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-extrabold text-[#193d36]">{p.nome}</span>
                  <span className="block truncate text-[10.5px] font-semibold text-slate-500">
                    {[p.responsavel && `Acompanhante: ${p.responsavel}`, p.telefone && mascararTelefone(p.telefone)].filter(Boolean).join(' · ') || 'Sem acompanhante no cadastro'}
                  </span>
                </span>
                <Link2 className="h-3.5 w-3.5 shrink-0 text-[#2f7f74]" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-1 rounded-[14px] border border-[#2f7f74]/25 bg-[#eef3f2] p-3">
          <p className="text-[12px] font-extrabold text-[#193d36]">{escolhido.nome}</p>
          <p className="text-[10.5px] font-semibold text-slate-600">
            Telefone do cadastro: {mascararTelefone(escolhido.telefone) || 'sem telefone'}
          </p>
          <label className="mt-3 block text-[10.5px] font-extrabold text-slate-600">
            De quem é este número?
            <select
              value={quem}
              onChange={(e) => setQuem(e.target.value)}
              className="mt-1 w-full rounded-[10px] border border-[#193d36]/15 bg-white px-3 py-2 text-[12px] font-semibold outline-none focus:border-[#2f7f74]"
            >
              {QUEM_E_O_TELEFONE.map((opcao) => (
                <option key={opcao} value={opcao}>
                  {opcao}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-1.5 text-[10.5px] font-semibold text-slate-500">
            Aparece embaixo do nome do paciente, na conversa, para a equipe saber com quem está falando.
          </p>
          <button type="button" onClick={() => setEscolhido(null)} className="mt-2 text-[10.5px] font-extrabold text-[#17564d] underline underline-offset-2">
            Escolher outro paciente
          </button>
        </div>
      )}

      {erro && <p role="alert" className="rounded-[10px] bg-[#fde8e8] px-3 py-2 text-[11px] font-bold text-[#b42318]">{erro}</p>}

      <div className="mt-1 flex justify-end gap-2">
        <button
          type="button"
          onClick={onFechar}
          className="rounded-xl border border-[#193d36]/10 bg-white px-4 py-2 text-[11px] font-extrabold text-slate-600 hover:border-[#193d36]/25"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={!escolhido || ligando}
          onClick={() => void ligar()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#193d36] px-4 py-2 text-[11px] font-extrabold text-white transition hover:bg-[#13453c] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Link2 className="h-3.5 w-3.5" />
          {ligando ? 'Ligando...' : 'Ligar ao cadastro'}
        </button>
      </div>
    </DialogContent>
  )
}

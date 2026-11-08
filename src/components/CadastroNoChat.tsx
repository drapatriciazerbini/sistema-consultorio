import { useState } from 'react'
import { AlertTriangle, Check, IdCard } from 'lucide-react'
import type { Patient } from '@/types/patient'
import type { PatientDraft } from '@/lib/store'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import CamposDoCadastro from '@/components/CamposDoCadastro'
import { useDialogos } from '@/components/dialogos-contexto'
import { useVoltarDoCelular } from '@/lib/voltar-do-celular'
import { idade } from '@/lib/followup'
import {
  cadastroAlterado,
  conferirCadastro,
  formularioDoCadastro,
  type FormularioDoPaciente,
} from '@/lib/cadastro-do-paciente'

/**
 * Os dados cadastrais abertos de dentro da conversa (07/11/2026, do sistema do
 * Dr. Marcello, onde entrou em 04/11/2026 a pedido do Edu).
 *
 * Clicar no nome do paciente no chat e ja ver ou corrigir o cadastro, sem
 * trocar de aba e perder a conversa de vista. Popup de 90% da tela, por cima
 * do chat; fechar devolve a conversa exatamente onde estava.
 *
 * Grava pelo mesmo caminho de Pacientes (updatePatient do Home), entao a lista
 * de pacientes, a agenda e o prontuario veem a mudanca na hora.
 */
export default function CadastroNoChat({
  paciente,
  onFechar,
  onSalvar,
}: {
  /** null = fechado. */
  paciente: Patient | null
  onFechar: () => void
  onSalvar: (id: string, cadastro: PatientDraft) => Promise<void>
}) {
  // O voltar do celular fecha o popup, como o botao Fechar.
  useVoltarDoCelular(paciente !== null, onFechar)

  return (
    <Dialog open={paciente !== null}>
      {paciente && (
        // key: outro paciente, formulario novo. O mesmo paciente atualizado por
        // tras (lista recarregada) nao apaga o que a recepcao esta digitando.
        <FichaAberta key={paciente.id} paciente={paciente} onFechar={onFechar} onSalvar={onSalvar} />
      )}
    </Dialog>
  )
}

function FichaAberta({
  paciente,
  onFechar,
  onSalvar,
}: {
  paciente: Patient
  onFechar: () => void
  onSalvar: (id: string, cadastro: PatientDraft) => Promise<void>
}) {
  const { avisar } = useDialogos()
  const [original] = useState<FormularioDoPaciente>(() => formularioDoCadastro(paciente))
  const [form, setForm] = useState<FormularioDoPaciente>(original)
  const [sexoSugerido, setSexoSugerido] = useState(false)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [confirmandoSaida, setConfirmandoSaida] = useState(false)
  const alterado = cadastroAlterado(original, form)
  // Cadastro criado pelo sistema ou com o nome do contato: salvar sem mudar
  // nada e a propria conferencia, e tira o aviso (como em Pacientes).
  const aConferir = Boolean(paciente.criadoAutomaticamenteEm || paciente.nomeDoContatoEm)

  // Clique fora, Esc e o Fechar passam por aqui. Com alteracao, pergunta
  // dentro do proprio popup: o aviso geral da Central fica por baixo de um
  // dialogo aberto e nao receberia o clique.
  function tentarFechar() {
    if (salvando) return
    if (alterado) {
      setConfirmandoSaida(true)
      return
    }
    onFechar()
  }

  async function salvar() {
    const conferido = conferirCadastro(form)
    if ('erro' in conferido) {
      setErro(conferido.erro)
      return
    }
    setSalvando(true)
    setErro('')
    try {
      await onSalvar(paciente.id, conferido.cadastro)
      avisar('Cadastro salvo.', 'ok')
      onFechar()
    } catch (causa) {
      setErro(causa instanceof Error ? causa.message : 'Não foi possível salvar o cadastro.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <DialogContent
      onEscapeKeyDown={(evento) => {
        evento.preventDefault()
        tentarFechar()
      }}
      onInteractOutside={(evento) => {
        evento.preventDefault()
        tentarFechar()
      }}
      onCloseAutoFocus={(evento) => evento.preventDefault()}
      // O X do componente chama onOpenChange, que este Dialog nao escuta:
      // o botao proprio abaixo passa por tentarFechar.
      showCloseButton={false}
      className="flex h-[90dvh] max-h-[90dvh] w-[90vw] max-w-[90vw] flex-col gap-0 overflow-hidden rounded-[24px] border-[#193d36]/10 bg-[#fbfaf5] p-0 sm:max-w-[90vw]"
    >
      <div className="flex items-start gap-3 border-b border-[#193d36]/[0.07] bg-white px-5 pb-4 pt-5 sm:px-8">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[15px] bg-[#eae3d4] text-[#1f5f55]">
          <IdCard className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-left text-lg font-extrabold tracking-[-0.03em] text-[#193d36]">
            {paciente.nome}
          </DialogTitle>
          <DialogDescription className="mt-1 text-left text-[11px] text-slate-500">
            Dados cadastrais
            {paciente.nascimento && ` · ${idade(paciente.nascimento)}`}
            {' · '}o que mudar aqui vale para Pacientes, agenda e prontuário.
          </DialogDescription>
          {/* O cadastro que o sistema criou sozinho (ver AConferir em
              Pacientes): salvar daqui tambem conta como conferido. */}
          {paciente.criadoAutomaticamenteEm && (
            <p className="mt-2 inline-flex rounded-full bg-[#f3f0e6] px-2.5 py-1 text-[10px] font-extrabold text-[#1f5f55]">
              Criado pelo sistema a partir do WhatsApp: confira com o paciente e salve.
            </p>
          )}
          {paciente.nomeDoContatoEm && (
            <p className="mt-2 inline-flex rounded-full bg-[#fceceb] px-2.5 py-1 text-[10px] font-extrabold text-[#b42318]">
              Nome a confirmar: veio do contato do WhatsApp e pode ser de um familiar ou cuidador.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={tentarFechar}
          className="shrink-0 rounded-[12px] border border-[#193d36]/10 bg-white px-3 py-2 text-[11px] font-bold text-slate-500 transition hover:bg-slate-50"
        >
          Fechar
        </button>
      </div>

      <div className="scrollbar-subtle min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
        <CamposDoCadastro
          form={form}
          setForm={setForm}
          sexoSugerido={sexoSugerido}
          setSexoSugerido={setSexoSugerido}
          ladoALado
        />

        {erro && (
          <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] font-bold text-red-600">{erro}</p>
        )}
      </div>

      <div className="border-t border-[#193d36]/[0.07] bg-white px-5 py-4 sm:px-8">
        {confirmandoSaida ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto inline-flex items-center gap-2 text-[11px] font-bold text-[#8a5a00]">
              <AlertTriangle className="h-4 w-4" />
              Há alterações sem salvar.
            </p>
            <button
              type="button"
              onClick={() => setConfirmandoSaida(false)}
              className="rounded-[14px] bg-[#193d36] px-4 py-3 text-xs font-extrabold text-white transition hover:bg-[#13453c]"
            >
              Continuar editando
            </button>
            <button
              type="button"
              onClick={onFechar}
              className="rounded-[14px] border border-red-200 bg-white px-4 py-3 text-xs font-bold text-red-600 transition hover:bg-red-50"
            >
              Descartar alterações
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando || (!alterado && !aConferir)}
              className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#193d36] px-5 py-3 text-xs font-extrabold text-white shadow-[0_10px_22px_rgba(25,61,54,.16)] transition hover:bg-[#13453c] disabled:opacity-40 sm:flex-none sm:px-8"
            >
              <Check className="h-4 w-4 text-[#dfc49b]" strokeWidth={3} />
              {salvando ? 'Salvando...' : alterado ? 'Salvar alterações' : aConferir ? 'Confirmar cadastro' : 'Nada alterado'}
            </button>
            <button
              type="button"
              onClick={tentarFechar}
              className="rounded-[14px] border border-[#193d36]/10 bg-white px-4 py-3 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
            >
              {alterado ? 'Cancelar' : 'Fechar'}
            </button>
          </div>
        )}
      </div>
    </DialogContent>
  )
}

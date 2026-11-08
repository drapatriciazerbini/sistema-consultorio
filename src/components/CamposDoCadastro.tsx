import type { Dispatch, ReactNode, SetStateAction } from 'react'
import type { PatientDraft } from '@/lib/store'
import type { FormularioDoPaciente } from '@/lib/cadastro-do-paciente'
import { editarComMascara, mascararCpf, mascararTelefone } from '@/lib/mascaras'
import { opcoesDeUnidade, useUnidades } from '@/lib/unidades'
import { sexoAoDigitarNome } from '@/lib/sexo-pelo-nome'

/**
 * Os campos do cadastro do paciente (07/11/2026, do sistema do Dr. Marcello),
 * usados em Pacientes (gaveta lateral) e na conversa (popup ao clicar no
 * nome). Um componente so, para as duas telas nunca divergirem num campo ou
 * num aviso. Os campos e textos sao os que Pacientes ja tinha aqui.
 */

const inputClass =
  'mt-1.5 w-full rounded-[13px] border border-[#193d36]/10 bg-[#faf9f4] px-3.5 py-2.5 text-xs font-semibold text-[#193d36] outline-none transition placeholder:font-normal placeholder:text-slate-300 focus:border-[#2f7f74] focus:bg-white focus:ring-4 focus:ring-[#2f7f74]/10'

function Field({
  label,
  children,
  required,
  className = '',
}: {
  label: string
  children: ReactNode
  required?: boolean
  className?: string
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-[10px] font-extrabold uppercase tracking-[0.1em] text-slate-500">
        {label}
        {required && <span className="ml-1 text-[#2f7f74]">*</span>}
      </span>
      {children}
    </label>
  )
}

function Divisoria({ titulo, className }: { titulo: string; className: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="h-px flex-1 bg-[#193d36]/[0.07]" />
      <span className="text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-400">{titulo}</span>
      <span className="h-px flex-1 bg-[#193d36]/[0.07]" />
    </div>
  )
}

export default function CamposDoCadastro({
  form,
  setForm,
  sexoSugerido,
  setSexoSugerido,
  ladoALado = false,
}: {
  form: FormularioDoPaciente
  setForm: Dispatch<SetStateAction<FormularioDoPaciente>>
  /** O sexo veio de palpite pelo nome: a tela avisa que precisa de conferencia. */
  sexoSugerido: boolean
  setSexoSugerido: (sugerido: boolean) => void
  /**
   * Identificacao e consulta lado a lado, a partir da tela larga. E o popup da
   * conversa, que ocupa 90% da tela: empilhado, sobraria metade em branco.
   */
  ladoALado?: boolean
}) {
  const unidadesDaClinica = useUnidades()

  function set<K extends keyof FormularioDoPaciente>(key: K, value: FormularioDoPaciente[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function mudarNome(nome: string) {
    const { sexo, sugerido } = sexoAoDigitarNome(nome, form.sexo, sexoSugerido)
    setForm((current) => ({ ...current, nome, sexo }))
    setSexoSugerido(sugerido)
  }

  return (
    <div className={ladoALado ? 'lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-10' : ''}>
      <div>
        <Divisoria titulo="Identificação, contato e endereço" className="mb-5" />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nome do paciente" required className="sm:col-span-2">
            <input className={inputClass} value={form.nome} onChange={(event) => mudarNome(event.target.value)} placeholder="Nome completo do paciente" />
          </Field>
          <Field label="Acompanhante">
            <input className={inputClass} value={form.responsavel} onChange={(event) => set('responsavel', event.target.value)} placeholder="Acompanhante ou cuidador, se houver" />
          </Field>
          <Field label="WhatsApp com DDD" required>
            <input
              className={inputClass}
              value={form.telefone}
              onChange={(event) => set('telefone', editarComMascara(form.telefone, event.target.value, mascararTelefone))}
              placeholder="(13) 9 9999-9999"
              inputMode="tel"
              maxLength={21}
            />
          </Field>
          <Field label="Data de nascimento">
            <input type="date" className={inputClass} value={form.nascimento} onChange={(event) => set('nascimento', event.target.value)} />
          </Field>
          {/* CPF e do PACIENTE, nao do responsavel - inclusive de bebe, que
              tem CPF desde o registro de nascimento. A RDC 1000/25 passou a
              exigi-lo em toda receita; sem ele a Memed recusa a emissao.
              Fica opcional aqui de proposito: travar o cadastro de um
              paciente novo por falta de CPF seria pior do que o problema. */}
          <Field label="CPF do paciente">
            <input
              className={inputClass}
              value={form.cpf}
              onChange={(event) => set('cpf', editarComMascara(form.cpf, event.target.value, mascararCpf))}
              placeholder="Necessário para emitir receita"
              inputMode="numeric"
              maxLength={14}
            />
          </Field>
          <Field label="E-mail">
            <input
              className={inputClass}
              value={form.email}
              onChange={(event) => set('email', event.target.value)}
              placeholder="Para onde a receita pode ser enviada"
              inputMode="email"
            />
          </Field>
          <Field label="Sexo" required>
            <select
              className={inputClass}
              value={form.sexo}
              onChange={(event) => {
                // Escolha da equipe manda: some o aviso de sugestao.
                setSexoSugerido(false)
                set('sexo', event.target.value as PatientDraft['sexo'])
              }}
            >
              <option value="" disabled>Escolha</option>
              <option value="F">Feminino</option>
              <option value="M">Masculino</option>
              <option value="O">Outro / não informado</option>
            </select>
            {sexoSugerido && (
              <span className="mt-1 block text-[10px] font-semibold text-[#17564d]">
                Sugerido pelo nome. Confira antes de salvar.
              </span>
            )}
          </Field>
          {/* Onde o paciente MORA. Ate 23/09/2026 estes dois ficavam em
              "Agenda e localizacao", ao lado da unidade, e liam como o local
              do atendimento - a pergunta foi "cade onde ele mora?". Aqui
              pesa mais: e o endereco que decide a visita em casa. */}
          <Field label="Cidade onde mora">
            <input className={inputClass} value={form.cidade} onChange={(event) => set('cidade', event.target.value)} placeholder="Santos" />
          </Field>
          <Field label="Bairro onde mora">
            <input className={inputClass} value={form.bairro} onChange={(event) => set('bairro', event.target.value)} placeholder="Gonzaga" />
          </Field>
        </div>
      </div>

      <div>
        <Divisoria titulo="Consulta" className={ladoALado ? 'my-6 lg:mb-5 lg:mt-0' : 'my-6'} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data da consulta" required>
            <input type="date" className={inputClass} value={form.dataConsulta} onChange={(event) => set('dataConsulta', event.target.value)} />
          </Field>
          <Field label="Unidade">
            <select className={inputClass} value={form.unidade} onChange={(event) => set('unidade', event.target.value)}>
              {opcoesDeUnidade(unidadesDaClinica, form.unidade).map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Convênio">
            <input className={inputClass} value={form.convenio} onChange={(event) => set('convenio', event.target.value)} placeholder="Particular, Unimed..." />
          </Field>
          {/* Ate 31/08/2026 este texto e a "Observacoes" do prontuario eram
              a MESMA coluna, espelhada por gatilho: o medico escrevia a
              observacao clinica e apagava o recado da recepcao sem que
              ninguem visse. Agora sao dois campos de verdade, e o rotulo
              precisa deixar claro qual e qual. */}
          <Field label="Recado da recepção" className="sm:col-span-2">
            <textarea
              className={`${inputClass} min-h-[84px] resize-y`}
              value={form.observacoes}
              onChange={(event) => set('observacoes', event.target.value)}
              placeholder="Ex.: prefere contato à tarde, vem sempre com a avó, reembolso pelo convênio."
            />
            <p className="mt-1.5 text-[9px] font-semibold text-slate-400">
              Fica na ficha da pessoa e acompanha todas as consultas. Observação clínica vai no
              prontuário, na próxima etapa.
            </p>
          </Field>
        </div>
      </div>
    </div>
  )
}

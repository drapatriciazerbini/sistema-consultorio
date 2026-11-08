import type { Patient } from '@/types/patient'
import type { PatientDraft } from '@/lib/store'
import { mascararCpf, mascararTelefone } from '@/lib/mascaras'

/**
 * O formulario do cadastro do paciente, fora da tela (07/11/2026, do sistema
 * do Dr. Marcello).
 *
 * Ate aqui ele morava dentro de Pacientes. O cadastro passou a abrir tambem
 * pelo nome do paciente na conversa, sem sair do chat. Com duas telas editando
 * o mesmo cadastro, as regras de validacao ficam num lugar so: uma copia que
 * esquecesse o sexo obrigatorio ou o telefone com DDD gravaria pela conversa o
 * que Pacientes recusa.
 */

/**
 * O formulario aceita sexo em branco; o cadastro gravado, nao. Ate aqui o
 * formulario abria com Feminino marcado (ver sexoAoDigitarNome).
 */
export type FormularioDoPaciente = Omit<PatientDraft, 'sexo'> & { sexo: PatientDraft['sexo'] | '' }

export function cadastroVazio(unidadePadrao = ''): FormularioDoPaciente {
  return {
    nome: '',
    responsavel: '',
    nascimento: '',
    sexo: '',
    cpf: '',
    email: '',
    telefone: '',
    cidade: '',
    bairro: '',
    convenio: '',
    cid: '',
    unidade: unidadePadrao,
    dataConsulta: new Date().toISOString().slice(0, 10),
    observacoes: '',
  }
}

/** O cadastro gravado, pronto para editar. */
export function formularioDoCadastro(patient: Patient): FormularioDoPaciente {
  return {
    nome: patient.nome,
    responsavel: patient.responsavel,
    nascimento: patient.nascimento,
    sexo: patient.sexo,
    // Com mascara ao abrir; o repositorio tira de novo antes de gravar.
    telefone: mascararTelefone(patient.telefone),
    cpf: mascararCpf(patient.cpf ?? ''),
    email: patient.email ?? '',
    cidade: patient.cidade,
    bairro: patient.bairro,
    convenio: patient.convenio,
    cid: patient.cid,
    unidade: patient.unidade,
    dataConsulta: patient.dataConsulta,
    observacoes: patient.observacoes,
  }
}

/** O que o formulario precisa ter para gravar; devolve o cadastro ou o motivo da recusa. */
export function conferirCadastro(form: FormularioDoPaciente): { cadastro: PatientDraft } | { erro: string } {
  if (!form.nome.trim()) return { erro: 'Informe o nome do paciente.' }
  if (form.telefone.replace(/\D/g, '').length < 10) return { erro: 'Informe um telefone válido com DDD.' }
  if (!form.dataConsulta) return { erro: 'Informe a data da consulta.' }
  if (!form.sexo) {
    return {
      erro: 'Escolha o sexo do paciente: ele vai para a receita da Memed e para o texto do acompanhamento. Se não foi informado, use "Outro / não informado".',
    }
  }
  return { cadastro: { ...form, sexo: form.sexo } }
}

/**
 * O formulario mudou desde que abriu? Na conversa, um clique fora do popup
 * fecharia a ficha e levaria junto o que a recepcao digitou sem salvar.
 */
export function cadastroAlterado(antes: FormularioDoPaciente, agora: FormularioDoPaciente): boolean {
  return (Object.keys(antes) as (keyof FormularioDoPaciente)[]).some(
    (campo) => String(antes[campo] ?? '') !== String(agora[campo] ?? ''),
  )
}

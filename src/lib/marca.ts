import logo from '@/assets/logo.webp'

/**
 * A marca do sistema: logo, nome e como o consultorio se apresenta.
 *
 * Veio do sistema de origem em 30/09/2026. La, cada clinica pode ter a sua
 * marca (a real e a de teste). Aqui ha uma clinica so, a da Dra. Patricia,
 * entao toda funcao devolve a mesma marca. As assinaturas continuam as do
 * sistema de origem para os proximos portes entrarem sem adaptacao.
 */
export type Marca = {
  src: string
  nome: string
  mostraEtiquetaDoProduto: boolean
  /** Titulo da aba do navegador. */
  titulo: string
  /** Nome no rodape do menu, ao lado do botao de sair. Nulo = nome de quem entrou. */
  nomeNoRodape: string | null
  /** Como o consultorio se apresenta nos modelos da Meta. */
  quemEntraEmContato: string
  consultorioNaResposta: string
}

const DRA_PATRICIA: Marca = {
  src: logo,
  nome: 'Dra. Patrícia Zerbini',
  mostraEtiquetaDoProduto: true,
  titulo: 'Central de Cuidado | Dra. Patrícia Zerbini',
  nomeNoRodape: 'Dra. Patrícia Zerbini',
  quemEntraEmContato: 'O consultório da Dra. Patrícia Zerbini',
  consultorioNaResposta: 'o consultório da Dra. Patrícia Zerbini',
}

export function marcaDaClinica(clinicId?: string | null): Marca {
  void clinicId
  return DRA_PATRICIA
}

export function marcaSemClinicaConhecida(clinicId?: string | null): Marca {
  void clinicId
  return DRA_PATRICIA
}

export function ultimaClinicaVista(): string | null {
  return null
}

export function lembrarClinica(clinicId: string) {
  // Uma clinica so: nao ha o que lembrar.
  void clinicId
}

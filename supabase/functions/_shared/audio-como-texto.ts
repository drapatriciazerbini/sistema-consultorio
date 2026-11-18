/**
 * Audio do paciente vira texto para o robo e para a IA (porte de 18/11/2026 do
 * sistema do Dr. Marcello, onde nasceu em 09/11/2026).
 *
 * Pedido do Edu, na origem: "quando alguem enviar audio voce pode transcrever
 * e interpretar e mandar para a Central resumido, ou se for algo que voce
 * saiba pode responder". Ate aqui o audio era anexo: o robo respondia "Recebi
 * o que voce enviou... ja avisei a nossa equipe" e a conversa ia para a fila,
 * mesmo quando a pessoa so dizia "quero marcar uma consulta". Aqui pesa mais:
 * o idoso, a filha ou o cuidador costuma falar em vez de digitar.
 *
 * Agora o audio e transcrito na chegada (Groq, a mesma do ditado do
 * prontuario, ver transcricao.ts) e o texto entra no robo e na IA como se a
 * pessoa tivesse digitado: pedido de consulta, informacao e o resumo para a
 * equipe saem pelos caminhos de sempre. Na Central, o balao mostra o audio e,
 * embaixo, o texto com 🎤. Sem transcricao (sem chave, falha, demora, audio
 * mudo), o audio volta a ser anexo, como antes, e a mensagem ganha a linha
 * vermelha dizendo por que (avisoDoAudioSemTexto).
 *
 * Duas regras daqui, que a origem nao tem:
 *  - tudo nasce DESLIGADO (modoDoAudio): sem o segredo AUDIO_VIRA_TEXTO o
 *    audio segue como anexo, igual a antes, e nada sai para a Groq. Com
 *    AUDIO_VIRA_TEXTO=central o texto aparece na Central, embaixo do audio;
 *    com =robo o robo tambem le e responde, o que e resposta automatica nova
 *    a paciente e o Edu ainda nao validou;
 *  - audio nunca cancela consulta nem descadastra o numero sozinho
 *    (audioPedeGente).
 */

import type { MotivoSemTexto, Transcricao } from './transcricao.ts'

export function ehAudio(tipo: string | null | undefined): boolean {
  return tipo === 'audio' || tipo === 'voice'
}

/**
 * Ate onde o audio vira texto, pelo segredo AUDIO_VIRA_TEXTO do servidor:
 *  - 'desligado' (o padrao, sem o segredo ou com valor desconhecido): nao
 *    transcreve nada, nenhum audio de paciente sai para a Groq;
 *  - 'central': transcreve e mostra o texto na Central; o robo segue tratando
 *    o audio como anexo;
 *  - 'robo': alem disso, o robo e a IA leem o texto e respondem.
 *
 * Nasce desligado (18/11/2026): a regra da casa e que dado de paciente nao sai
 * do sistema, e transcrever manda a voz do paciente para um servico de fora.
 * Ate aqui so o ditado da medica ia para la. Quem decide ligar e o Edu, criando
 * o segredo. Valor desconhecido tambem fica desligado: erro de digitacao no
 * segredo nao pode mandar audio para fora nem ligar o robo sem ninguem decidir.
 */
export type ModoDoAudio = 'desligado' | 'central' | 'robo'
export function modoDoAudio(valor: string | null | undefined): ModoDoAudio {
  const v = String(valor ?? '').trim().toLowerCase()
  if (v === 'central') return 'central'
  if (v === 'robo' || v === 'robô') return 'robo'
  return 'desligado'
}

/**
 * Frases que o Whisper escreve sozinho em audio mudo ou so com barulho: vem do
 * rodape de legendas com que ele foi treinado. Tratadas como sem transcricao.
 */
const ALUCINACOES = [
  /amara\.org/i,
  /obrigad[oa] por assistir/i,
  /inscreva-se no canal/i,
  /legendas? (?:pela|por) /i,
  /^\W*(?:tchau|obrigad[oa])\W*$/i,
]

/** O texto que vale da transcricao, ou null quando nao ha nada para o robo ler. */
export function textoDaTranscricao(transcricao: string | null | undefined): string | null {
  const texto = String(transcricao ?? '').replace(/\s+/g, ' ').trim()
  if (texto.length < 2) return null
  if (ALUCINACOES.some((r) => r.test(texto))) return null
  return texto
}

/** Como o audio aparece no historico da Central: o texto com 🎤 na frente. */
export function corpoDoAudio(transcricao: string): string {
  return `🎤 ${transcricao}`
}

/**
 * O audio fala em cancelar ou em nao receber mais mensagens: quem decide e
 * gente. `lida` e o que interpretarResposta (lembrete.ts) entendeu do texto.
 *
 * A leitura da resposta ao lembrete e por palavra contida ("cancelar",
 * "desmarcar", "nao quero receber"), pensada para o botao e para a frase curta
 * digitada. Audio e comprido e a transcricao erra: "tive de cancelar o
 * passeio para poder ir" desmarcaria a consulta de um idoso, e a vaga dele
 * iria embora sem ninguem ter pedido. Nesses dois casos o audio volta a ser
 * anexo: a equipe e avisada, le o texto no balao e resolve. Confirmar e pedir
 * para remarcar continuam valendo por audio: nenhum dos dois tira a vaga.
 */
export function audioPedeGente(lida: { cancela: boolean; optedOut: boolean } | null | undefined): boolean {
  return Boolean(lida && (lida.cancela || lida.optedOut))
}

/**
 * A linha vermelha embaixo do audio, na Central, quando ele ficou sem texto
 * ou quando o robo nao agiu em cima dele. Nulo: nada a avisar (audio mudo nao
 * e defeito).
 *
 * Existe porque falha calada custa caro (ver o CLAUDE.md): sem a chave no
 * servidor, todo audio voltaria a ser anexo e ninguem saberia que a
 * transcricao nunca rodou.
 */
export function avisoDoAudioSemTexto(motivo: MotivoSemTexto | 'pede_gente' | null | undefined, detalhe = ''): string | null {
  if (motivo === 'sem_chave') return '⚠️ Transcrição não configurada: falta a chave GROQ_API_KEY no servidor. Ouça o áudio.'
  if (motivo === 'tamanho') return '⚠️ Áudio grande demais para transcrever. Ouça o áudio.'
  if (motivo === 'recusou') return `⚠️ O serviço de transcrição recusou este áudio${detalhe ? ` (${detalhe})` : ''}. Ouça o áudio.`
  if (motivo === 'falhou') return '⚠️ A transcrição falhou ou demorou demais. Ouça o áudio.'
  if (motivo === 'pede_gente') return '⚠️ O áudio fala em cancelar ou em não receber mensagens: o robô não fez nada sozinho. Ouça e responda.'
  return null
}

/**
 * O que o webhook faz com o audio que chegou, numa conta so (e testada):
 *  - paraORobo: o texto que o robo e a IA leem como se fosse digitado. Nulo: o
 *    audio segue como anexo, para a equipe;
 *  - corpo: o que aparece no balao da Central ("🎤 texto"). Nulo: o de antes;
 *  - aviso: a linha vermelha embaixo do balao. Nulo: nada a avisar.
 *
 * `interpretar` e o interpretarResposta de lembrete.ts ja com a janela do
 * lembrete: vem de fora para este arquivo nao arrastar as regras do lembrete.
 * `roboLe` e o modo 'robo' (ver modoDoAudio): falso, o texto fica so no balao.
 */
export function lerAudio(
  resultado: Transcricao,
  interpretar: (texto: string) => { cancela: boolean; optedOut: boolean },
  roboLe: boolean,
): { paraORobo: string | null; corpo: string | null; aviso: string | null } {
  const texto = textoDaTranscricao(resultado.texto)
  if (!texto) {
    return { paraORobo: null, corpo: null, aviso: resultado.texto === null ? avisoDoAudioSemTexto(resultado.motivo, resultado.detalhe) : null }
  }
  // So na Central: o robo nao le, entao nao ha o que avisar.
  if (!roboLe) return { paraORobo: null, corpo: corpoDoAudio(texto), aviso: null }
  if (audioPedeGente(interpretar(texto))) {
    return { paraORobo: null, corpo: corpoDoAudio(texto), aviso: avisoDoAudioSemTexto('pede_gente') }
  }
  return { paraORobo: texto, corpo: corpoDoAudio(texto), aviso: null }
}

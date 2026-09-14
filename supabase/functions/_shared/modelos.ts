/**
 * O texto dos modelos aprovados na Meta.
 *
 * Fora da janela de 24 horas o WhatsApp só aceita modelo aprovado, e a Meta
 * guarda o texto do lado dela: nós mandamos o nome do modelo e os parâmetros,
 * e ela monta a mensagem. O sistema, então, nunca via o que o paciente leu -
 * guardava um resumo ("Acompanhamento de 30 dias enviado para Fulano"), e a
 * equipe abria a conversa na plataforma sem saber o que tinha sido dito.
 *
 * Aqui ficam as mesmas frases, para o registro da conversa mostrar a mensagem
 * como ela chega no celular. Se um modelo for alterado na Meta, este arquivo
 * precisa acompanhar: por isso os textos estão juntos, curtos e comentados, e
 * não espalhados pelas funções.
 *
 * Os textos abaixo são os do consultório da Dra. Patrícia Zerbini e precisam
 * ser idênticos aos aprovados na Meta. A íntegra para submissão, com exemplos
 * de preenchimento, está em MODELOS-META.md, na raiz do projeto.
 */

/** Modelos conhecidos, pelo nome cadastrado na Meta. */
const MODELOS: Record<string, { corpo: string; rodape?: string; botoes?: string[] }> = {
  // Quem responde por um idoso muitas vezes é filho, cônjuge ou cuidador. Por
  // isso a pergunta não é "como você está", e sim como estão as coisas desde a
  // consulta: serve tanto para o próprio paciente quanto para o acompanhante.
  //
  // Os rótulos precisam ser iguais aos aprovados na Meta, que é quem devolve o
  // texto do botão quando a pessoa toca. Desde 14/09/2026 o robô entende por
  // palavra contida, em lembrete.ts, então "Confirmar presença" e "Confirmar"
  // funcionam igual: o rótulo pode ser escrito para o paciente, não para o
  // código. O que não pode é a cópia daqui divergir do texto aprovado, senão a
  // tela de conversas mostra um botão que ninguém viu.
  acompanhamento_pos_consulta: {
    corpo:
      'Olá, {{1}}. Aqui é o consultório da Dra. Patrícia Zerbini. Estamos acompanhando ' +
      'a consulta realizada em {{2}}. Como estão as coisas desde então? Responda esta ' +
      'mensagem se precisar falar com a equipe.',
    rodape: 'Para não receber novos acompanhamentos, responda SAIR.',
    botoes: ['Estou bem', 'Preciso de ajuda', 'Não quero receber'],
  },
  // O {{4}} recebe o nome da unidade cadastrada na agenda. Como a Dra. Patrícia
  // atende nos dois formatos, os nomes das unidades precisam completar a frase
  // sozinhos: "no consultório, no Gonzaga" e "em visita domiciliar".
  lembrete_consulta: {
    corpo:
      'Olá, {{1}}. Lembrete da consulta com a Dra. Patrícia Zerbini em {{2}}, às {{3}}, ' +
      '{{4}}. Podemos confirmar a presença?',
    botoes: ['Confirmar presença', 'Preciso remarcar'],
  },
  // A resposta da equipe fora da janela de 24 horas. O {{2}} é o texto que a
  // pessoa digitou na tela - por isso o registro precisa deste modelo aqui:
  // sem ele, a conversa guardaria "modelo enviado" e ninguém saberia o que o
  // paciente leu, que é justamente o conteúdo que importa.
  resposta_da_clinica: {
    corpo:
      'Olá, {{1}}. Aqui é o consultório da Dra. Patrícia Zerbini.\n\n{{2}}\n\n' +
      'Se precisar, é só responder por aqui.',
  },
}

/**
 * A mensagem como o paciente recebe, com os parâmetros no lugar.
 *
 * Modelo desconhecido devolve null, e quem chamou usa o resumo de antes: um
 * modelo novo na Meta não pode impedir o envio nem apagar o registro.
 */
export function textoDoModelo(nome: string, parametros: string[]): string | null {
  const modelo = MODELOS[nome]
  if (!modelo) return null

  const corpo = modelo.corpo.replace(/\{\{(\d+)\}\}/g, (_, indice) => parametros[Number(indice) - 1] ?? '')

  return [
    corpo,
    modelo.rodape,
    // Os botões entram no texto porque são parte do que a pessoa vê, e porque
    // explicam as respostas curtas que voltam depois ("Estou bem") para quem
    // ler a conversa semanas mais tarde.
    modelo.botoes?.length ? `[${modelo.botoes.join(' · ')}]` : null,
  ]
    .filter(Boolean)
    .join('\n\n')
}

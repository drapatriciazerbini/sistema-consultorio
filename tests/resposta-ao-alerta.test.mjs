// A resposta da Dra. Patricia ao aviso do pedido, pelo WhatsApp dela
// (28/10/2026). Porte de tests/resposta-ao-alerta.test.mjs do sistema do
// Dr. Marcello. Regra em supabase/functions/_shared/resposta-ao-alerta.ts.
// Banco e Meta de mentira: o que se testa e o que chega ao paciente, a Dra. e
// ao registro. Numeros, nomes e valores inventados: o repositorio e publico.
import {
  conteudoDaMidia,
  copiaPelaApi,
  escolherAlerta,
  lerRespostaDaEquipe,
  midiaDoRascunho,
  midiaRecebida,
  oQueOPacienteDisse,
  papelDoNumero,
  rascunhoDeMidia,
  repassarAoCelular,
  repasseAberto,
  textoDoRepasse,
  textoDoRepasseDeMidia,
  textoParaOPaciente,
  tipoLimpo,
  tratarRespostaDaEquipe,
} from './resposta-ao-alerta.build.mjs'
import { bancoFalso } from './fixtures/banco-falso.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

const DRA = '5513999990001'
const EQUIPE = '5511988880002'
const PACIENTE = '5513977770003'
const PACIENTE2 = '5511966660004'
const AGORA = new Date('2026-10-28T17:30:00Z')
const haMinutos = (m) => new Date(AGORA.getTime() - m * 60000).toISOString()
const A1 = '11111111-1111-4111-8111-111111111111'
const A2 = '22222222-2222-4222-8222-222222222222'
const VALOR = 'A consulta com a Dra. Patrícia custa R$ 000,00 (valor de teste), no Pix ou no cartão.'

function alerta(extra = {}) {
  return {
    id: A1, clinic_id: 'c1', motivo: 'pedido', canal: 'WhatsApp', conversa_whatsapp: 'conv-1', conversa_instagram: null, teste: false,
    quem: 'Maria Teste da Silva', mensagens: ['wamid.AVISO1'], veredito: null, veredito_por: null, veredito_em: null,
    responde_em: null, valores_em: null, rascunho: null, rascunho_de: null, rascunho_em: null, criado_em: haMinutos(30), ...extra,
  }
}

function cenario({ alertas = [alerta()], ultimaDoPaciente = haMinutos(35), semTabela = [], valor = VALOR, status = 'open', pacienteFalha = false, copiaFalha = null } = {}) {
  const banco = bancoFalso(
    {
      alertas_de_urgencia: alertas,
      whatsapp_conversations: [
        { id: 'conv-1', wa_id: PACIENTE, patient_id: 'p1', profile_name: 'Filha da Maria', status, needs_attention: true, attention_reason: 'pedido_consulta' },
        { id: 'conv-2', wa_id: PACIENTE2, patient_id: null, profile_name: 'José Teste', status: 'open', needs_attention: true, attention_reason: 'visita' },
      ],
      whatsapp_messages: [
        { conversation_id: 'conv-1', direction: 'inbound', message_type: 'text', created_at: ultimaDoPaciente },
        { conversation_id: 'conv-2', direction: 'inbound', message_type: 'text', created_at: haMinutos(10) },
      ],
      patients: [{ id: 'p1', name: 'Maria Teste da Silva' }],
      clinic_settings: [{ clinic_id: 'c1', whatsapp_reply_template_name: 'resposta_da_clinica', whatsapp_template_language: 'pt_BR' }],
      bot_answers: valor === null
        ? []
        : [{ id: 'b1', clinic_id: 'c1', subject: 'Valor e pagamento', keywords: ['valor', 'quanto'], answer: valor, ask_unit: false, is_active: true, position: 1 }],
      conversation_notes: [],
      whatsapp_bot_events: [],
    },
    { semTabela },
  )
  const enviados = []
  // O acervo de arquivos, de mentira: guarda o caminho e o tipo.
  const acervo = []
  banco.storage = { from: (balde) => ({ upload: async (caminho, bytes, opcoes) => (acervo.push({ balde, caminho, bytes: bytes.length, tipo: opcoes?.contentType }), { error: null }) }) }
  const copias = []
  const amb = {
    admin: banco,
    clinicId: 'c1',
    agora: AGORA,
    numeros: [DRA, EQUIPE],
    // A copia pela Meta, de mentira: devolve um id novo do numero do consultorio.
    copiarMidia: async (midia) => {
      copias.push(midia)
      return copiaFalha ? { ok: false, erro: copiaFalha } : { ok: true, id: `novo-${midia.id}`, bytes: new Uint8Array([1, 2, 3]), mime: tipoLimpo(midia.mime) }
    },
    enviarWhatsApp: async (para, conteudo) => {
      enviados.push({ para, conteudo })
      if (pacienteFalha && (para === PACIENTE || para === PACIENTE2)) return { ok: false, erro: 'Re-engagement message' }
      return { ok: true, id: `wamid.${enviados.length}` }
    },
  }
  const textoDe = (e) => e.conteudo.text?.body ?? e.conteudo.interactive?.body?.text ?? JSON.stringify(e.conteudo.template ?? '')
  const para = (numero) => enviados.filter((e) => e.para === numero).map(textoDe)
  const notas = () => banco.db.conversation_notes.map((n) => n.texto)
  const saidas = () => banco.db.whatsapp_messages.filter((m) => m.direction === 'outbound')
  return { banco, enviados, amb, para, textoDe, notas, saidas, acervo, copias }
}
const toque = (payload) => ({ type: 'button', button: { payload, text: 'x' } })
const toqueInterativo = (id) => ({ type: 'interactive', interactive: { button_reply: { id, title: 'x' } } })
const texto = (body, citado = null) => ({ type: 'text', text: { body }, ...(citado ? { context: { id: citado } } : {}) })

// 1. Pecas puras.
confere('le o toque em Eu respondo', JSON.stringify(lerRespostaDaEquipe(toque(`PED:${A1}:responde`))) === JSON.stringify({ tipo: 'veredito', alertaId: A1, veredito: 'responde' }))
confere('le o toque em Mandar os valores', lerRespostaDaEquipe(toque(`PED:${A1}:valores`))?.veredito === 'valores')
confere('le a confirmacao', lerRespostaDaEquipe(toqueInterativo(`PEDTXT:${A1}:enviar`))?.tipo === 'confirmacao')
confere('botao de outro fluxo nao e daqui', lerRespostaDaEquipe(toque('CONFIRMAR')) === null && lerRespostaDaEquipe(toqueInterativo('2')) === null)
confere('"ok", "vi", "ciente" e 👍 sao visto', ['Ok!', 'vi', 'Ciente', '👍'].every((t) => lerRespostaDaEquipe(texto(t))?.tipo === 'visto'))
confere('mensagem e texto', lerRespostaDaEquipe(texto('Ok, pode vir terça às 14h'))?.tipo === 'texto')
confere('audio e midia', lerRespostaDaEquipe({ type: 'audio' })?.tipo === 'midia' && lerRespostaDaEquipe({ type: 'image' })?.tipo === 'midia')
confere('papel: primeiro numero e o da Dra.', papelDoNumero('13999990001', [DRA, EQUIPE]) === 'medica' && papelDoNumero(EQUIPE, [DRA, EQUIPE]) === 'equipe' && papelDoNumero(PACIENTE, [DRA, EQUIPE]) === null)
confere('mensagem da Dra. leva o nome dela', textoParaOPaciente('texto', 'medica', { o: 'a Dra. Patrícia', O: 'A Dra. Patrícia' }, 'Oi') === '💬 Mensagem da Dra. Patrícia: Oi')
{
  const dois = [alerta(), alerta({ id: A2, quem: 'José Teste', mensagens: ['wamid.AVISO2'], criado_em: haMinutos(10) })]
  confere('citado: o aviso exato', escolherAlerta(dois, 'wamid.AVISO2', AGORA)?.alerta?.id === A2)
  confere('sem citar e com dois: pergunta', escolherAlerta(dois, null, AGORA)?.ambiguos?.length === 2)
  confere('nenhum aviso nas ultimas 6 h: nada', escolherAlerta([alerta({ criado_em: haMinutos(7 * 60) })], null, AGORA) === null)
}

// 2. "Eu respondo": o paciente sabe que ela viu, a Dra. recebe o OK, fica registrado.
{
  const c = cenario()
  const tratou = await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:responde`))
  confere('eu respondo: tratou', tratou)
  confere('eu respondo: o paciente recebe', c.para(PACIENTE).at(-1) === 'A Dra. Patrícia viu o seu pedido e vai falar com você por aqui.', JSON.stringify(c.para(PACIENTE)))
  confere('eu respondo: a Dra. recebe o OK', c.para(DRA).at(-1) === '✅ Enviado para Maria Teste da Silva.', c.para(DRA).at(-1))
  confere('eu respondo: gravado como mensagem de gente (robo quieto)', c.saidas().some((m) => m.automatic === false && m.status === 'accepted' && m.body.includes('vai falar com você')))
  confere('eu respondo: vira nota na conversa', c.notas().some((n) => n.startsWith('🩺 A Dra. Patrícia respondeu ao aviso pelo WhatsApp: Eu respondo')), JSON.stringify(c.notas()))
  confere('eu respondo: veredito e resposta gravados', c.banco.db.alertas_de_urgencia[0].veredito === 'responde' && c.banco.db.alertas_de_urgencia[0].responde_em && c.banco.db.alertas_de_urgencia[0].respondido_por === DRA)
  const antes = c.para(PACIENTE).length
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:responde`))
  confere('eu respondo: segundo toque nao repete ao paciente', c.para(PACIENTE).length === antes && c.para(DRA).at(-1).includes('já foi enviado'), c.para(DRA).at(-1))
}
{
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, EQUIPE, toque(`PED:${A1}:responde`))
  confere('eu respondo da equipe: vai como equipe', c.para(PACIENTE).at(-1) === 'Nossa equipe viu o seu pedido e vai falar com você por aqui.', c.para(PACIENTE).at(-1))
  confere('eu respondo da equipe: a nota diz quem', c.notas().some((n) => n.startsWith('🩺 A equipe (final 0002) respondeu')), JSON.stringify(c.notas()))
}

// 3. "Mandar os valores": a resposta pronta de valor, como automatica.
{
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:valores`))
  confere('valores: o paciente recebe a resposta pronta', c.para(PACIENTE).at(-1) === VALOR, JSON.stringify(c.para(PACIENTE)))
  confere('valores: gravado como automatica', c.saidas().some((m) => m.automatic === true && m.body === VALOR))
  confere('valores: a Dra. recebe o OK e fica nota', c.para(DRA).at(-1) === '✅ Enviado para Maria Teste da Silva.' && c.notas().some((n) => n.includes('Mandar os valores')))
  const antes = c.para(PACIENTE).length
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:valores`))
  confere('valores: segundo toque nao manda de novo', c.para(PACIENTE).length === antes && c.para(DRA).at(-1).includes('já foram enviados'), c.para(DRA).at(-1))
  // "Eu respondo" depois dos valores ainda vale: um botao nao trava o outro.
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:responde`))
  confere('valores e depois eu respondo: os dois saem', c.para(PACIENTE).at(-1)?.includes('vai falar com você'))
}
for (const [nome, valor] of [['valor com ___', 'A consulta custa R$ ___.'], ['sem resposta de valor', null]]) {
  const c = cenario({ valor })
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:valores`))
  confere(`${nome}: nada vai ao paciente`, c.para(PACIENTE).length === 0, JSON.stringify(c.para(PACIENTE)))
  confere(`${nome}: a Dra. fica sabendo`, c.para(DRA).at(-1)?.includes('A resposta de valor não está cadastrada na Central'), c.para(DRA).at(-1))
  confere(`${nome}: a nota grita e o botao continua valendo`, c.notas().some((n) => n.includes('⚠️ Nada foi enviado')) && !c.banco.db.alertas_de_urgencia[0].valores_em)
}

// 4. Texto da Dra.: confirma antes, e so entao chega ao paciente.
{
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, texto('Posso atender na terça às 14h. Traga os exames.', 'wamid.AVISO1'))
  confere('texto: nada ao paciente antes do Enviar', c.para(PACIENTE).length === 0)
  const pergunta = c.enviados.at(-1)
  const botoes = pergunta.conteudo.interactive?.action?.buttons ?? []
  confere(
    'texto: pergunta com Enviar e Cancelar',
    pergunta.para === DRA && botoes.length === 2 && botoes[0].reply.id === `PEDTXT:${A1}:enviar` && c.textoDe(pergunta).startsWith('Vou mandar para Maria, como mensagem da Dra. Patrícia:'),
    c.textoDe(pergunta),
  )
  // So quem escreveu confirma.
  await tratarRespostaDaEquipe(c.amb, EQUIPE, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('texto: outro numero nao confirma', c.para(EQUIPE).at(-1)?.includes('escrita por outra pessoa') && c.para(PACIENTE).length === 0, c.para(EQUIPE).at(-1))
  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('texto: chega ao paciente com o nome dela', c.para(PACIENTE).at(-1) === '💬 Mensagem da Dra. Patrícia: Posso atender na terça às 14h. Traga os exames.', c.para(PACIENTE).at(-1))
  confere('texto: rascunho apagado e veredito', c.banco.db.alertas_de_urgencia[0].rascunho === null && c.banco.db.alertas_de_urgencia[0].veredito === 'texto')
  confere('texto: mensagem de gente, robo quieto', c.saidas().some((m) => m.automatic === false && m.body.startsWith('💬 Mensagem da Dra.')))
  confere('texto: vira nota com o que ela escreveu', c.notas().some((n) => n.startsWith('🩺 A Dra. Patrícia respondeu ao aviso pelo WhatsApp: "Posso atender na terça')), JSON.stringify(c.notas()))
  confere('texto: a Dra. recebe o OK', c.para(DRA).at(-1) === '✅ Enviado para Maria Teste da Silva.')
  const antes = c.para(PACIENTE).length
  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('texto: segundo Enviar nao manda de novo', c.para(PACIENTE).length === antes, JSON.stringify(c.para(PACIENTE)))
}
{
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, texto('liga pra ela amanhã', 'wamid.AVISO1'))
  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:cancelar`))
  confere('cancelar: nada vai ao paciente', c.para(PACIENTE).length === 0 && c.para(DRA).at(-1)?.startsWith('Cancelado'))
}
{
  const c = cenario({ alertas: [alerta({ rascunho: 'antigo', rascunho_de: DRA, rascunho_em: haMinutos(7 * 60) })] })
  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('rascunho de mais de 6 h: nao sai', c.para(PACIENTE).length === 0 && c.para(DRA).at(-1)?.includes('Não achei a mensagem'), c.para(DRA).at(-1))
}
{
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, texto('x'.repeat(901), 'wamid.AVISO1'))
  confere('texto longo: recusa em vez de cortar calado', c.para(DRA).at(-1)?.includes('passou de 900') && !c.banco.db.alertas_de_urgencia[0].rascunho, c.para(DRA).at(-1))
}

// 5. "ok", audio, varios avisos.
{
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, texto('ok'))
  confere('ok: so visto, nada ao paciente', c.para(DRA).at(-1) === '👍 Anotado.' && c.para(PACIENTE).length === 0)
  confere('ok: vira nota de que ela viu', c.notas().some((n) => n.includes('A Dra. Patrícia viu o aviso')), JSON.stringify(c.notas()))
  // Figurinha e o 👍 de quem viu: nao vai ao paciente.
  await tratarRespostaDaEquipe(c.amb, DRA, { type: 'sticker', sticker: { id: 'fig' } })
  confere('figurinha: so visto', c.para(DRA).at(-1) === '👍 Anotado.' && c.para(PACIENTE).length === 0 && c.copias.length === 0)
}
const dois = () => [alerta(), alerta({ id: A2, quem: 'José Teste', conversa_whatsapp: 'conv-2', mensagens: ['wamid.AVISO2'], criado_em: haMinutos(5) })]
{
  const c = cenario({ alertas: dois() })
  await tratarRespostaDaEquipe(c.amb, DRA, texto('pode vir amanhã'))
  confere('dois avisos sem citar: pede para responder em cima, com os nomes', c.para(DRA).at(-1)?.startsWith('Há 2 avisos recentes (José Teste, Maria Teste da Silva)') && c.para(DRA).at(-1).includes('toque em Responder'), c.para(DRA).at(-1))
  confere('dois avisos: nada sai e nada fica guardado', c.para(PACIENTE).length === 0 && c.para(PACIENTE2).length === 0 && c.banco.db.alertas_de_urgencia.every((a) => a.rascunho === null))
  await tratarRespostaDaEquipe(c.amb, DRA, texto('pode vir amanhã', 'wamid.AVISO2'))
  confere('dois avisos: em cima do aviso certo, vai para ele', c.textoDe(c.enviados.at(-1)).startsWith('Vou mandar para José'), c.textoDe(c.enviados.at(-1)))
}
{
  // "Eu respondo" num aviso abre a conversa com ele: o texto seguinte vai para o mesmo.
  const c = cenario({ alertas: dois() })
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A2}:responde`))
  await tratarRespostaDaEquipe(c.amb, DRA, texto('Boa tarde, posso na sexta.'))
  confere('conversa ativa: o texto seguinte segue para o mesmo paciente', c.textoDe(c.enviados.at(-1)).startsWith('Vou mandar para José'), c.textoDe(c.enviados.at(-1)))
  await tratarRespostaDaEquipe(c.amb, EQUIPE, texto('Boa tarde'))
  confere('conversa ativa e por numero', c.textoDe(c.enviados.at(-1)).startsWith('Há 2 avisos'), c.textoDe(c.enviados.at(-1)))
}

// 6. Fora das condicoes: segue o robo de sempre.
{
  const c = cenario({ alertas: [alerta({ criado_em: haMinutos(10 * 60) })] })
  confere('sem aviso nas ultimas 6 h: segue o robo', (await tratarRespostaDaEquipe(c.amb, DRA, texto('oi, quero testar o menu'))) === false && c.enviados.length === 0)
  confere('mas em cima de um aviso de 10 h: e resposta', (await tratarRespostaDaEquipe(c.amb, DRA, texto('pode vir', 'wamid.AVISO1'))) === true)
  confere('fora da lista: segue o robo', (await tratarRespostaDaEquipe(cenario().amb, PACIENTE, texto('oi'))) === false)
  confere('botao do menu, mesmo da Dra.: segue o robo', (await tratarRespostaDaEquipe(cenario().amb, DRA, toqueInterativo('2'))) === false)
  confere('sem a tabela: segue o robo', (await tratarRespostaDaEquipe(cenario({ semTabela: ['alertas_de_urgencia'] }).amb, DRA, toque(`PED:${A1}:responde`))) === false)
  const nenhum = cenario({ alertas: [] })
  confere('nenhum aviso: segue o robo', (await tratarRespostaDaEquipe(nenhum.amb, DRA, texto('menu'))) === false)
}

// 7. Janela de 24 h fechada: vai pelo modelo aprovado.
{
  const c = cenario({ alertas: [alerta({ criado_em: haMinutos(20 * 60) })], ultimaDoPaciente: haMinutos(30 * 60) })
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:responde`))
  const msg = c.enviados.find((e) => e.para === PACIENTE)
  confere('janela fechada: modelo resposta_da_clinica', msg?.conteudo.template?.name === 'resposta_da_clinica', JSON.stringify(msg?.conteudo))
  const parametros = msg?.conteudo.template?.components?.[0]?.parameters ?? []
  confere('janela fechada: primeiro nome do cadastro, sem quebra de linha', parametros[0]?.text === 'Maria' && parametros.every((p) => !/\n/.test(p.text)), JSON.stringify(parametros))
  confere('janela fechada: o historico guarda o que o paciente leu', c.saidas().some((m) => m.template_name === 'resposta_da_clinica' && m.body.includes('A Dra. Patrícia viu o seu pedido')))
}

// 8. Nao chegou: a Dra. fica sabendo, a nota grita, o botao volta a valer.
{
  const c = cenario({ pacienteFalha: true })
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:responde`))
  confere('falhou: a Dra. recebe o motivo', c.para(DRA).at(-1) === '⚠️ Não consegui enviar: Re-engagement message. Responda pela Central.', c.para(DRA).at(-1))
  confere('falhou: a nota diz que nao chegou', c.notas().some((n) => n.includes('NÃO chegou ao paciente')), JSON.stringify(c.notas()))
  confere('falhou: o botao volta a valer', !c.banco.db.alertas_de_urgencia[0].responde_em)
}
{
  const c = cenario({ status: 'opted_out' })
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:valores`))
  confere('paciente que pediu para nao receber: nada sai', c.para(PACIENTE).length === 0 && c.para(DRA).at(-1)?.includes('pediu para não receber'), c.para(DRA).at(-1))
}

// 9. Aviso de teste da tela.
{
  const c = cenario({ alertas: [alerta({ teste: true, conversa_whatsapp: null, quem: 'Teste da Central' })] })
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:valores`))
  confere('teste: responde que era teste e nada sai', c.para(DRA).at(-1) === '✅ Era um aviso de teste: nada foi enviado.' && c.para(PACIENTE).length === 0, c.para(DRA).at(-1))
  await tratarRespostaDaEquipe(c.amb, DRA, texto('funcionou?'))
  confere('teste: texto em cima tambem', c.para(DRA).at(-1) === '✅ Era um aviso de teste: nada foi enviado.')
}

// 10. A resposta do paciente de volta ao celular (30/10/2026).
{
  // Falar com ele abre; o valor, nao.
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:valores`))
  confere('repasse: Mandar os valores nao abre', !c.banco.db.alertas_de_urgencia[0].repasse_aberto_em)
  await tratarRespostaDaEquipe(c.amb, DRA, toque(`PED:${A1}:responde`))
  const a = c.banco.db.alertas_de_urgencia[0]
  confere('repasse: Eu respondo abre, com quem falou', a.repasse_por === DRA && a.repasse_aberto_em === AGORA.toISOString(), JSON.stringify(a))
  const e = cenario()
  await tratarRespostaDaEquipe(e.amb, EQUIPE, texto('Pode ser sexta às 14h?', 'wamid.AVISO1'))
  await tratarRespostaDaEquipe(e.amb, EQUIPE, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('repasse: mensagem escrita abre, com quem falou', e.banco.db.alertas_de_urgencia[0].repasse_por === EQUIPE && e.banco.db.alertas_de_urgencia[0].repasse_aberto_em, JSON.stringify(e.banco.db.alertas_de_urgencia[0]))
  const falha = cenario({ pacienteFalha: true })
  await tratarRespostaDaEquipe(falha.amb, DRA, toque(`PED:${A1}:responde`))
  confere('repasse: mensagem que nao chegou ao paciente nao abre', !falha.banco.db.alertas_de_urgencia[0].repasse_aberto_em)
}
{
  const aberto = (extra = {}) => alerta({ repasse_por: DRA, repasse_aberto_em: haMinutos(60), repasse_modelo_em: null, ...extra })
  const c = cenario({ alertas: [aberto()] })
  const r = await repasseAberto(c.banco, 'c1', 'conv-1', AGORA)
  confere('repasse: acha o aberto da conversa', r?.id === A1)
  confere('repasse: outra conversa nao', (await repasseAberto(c.banco, 'c1', 'conv-2', AGORA)) === null)
  await repassarAoCelular(c.amb, r, 'conv-1', PACIENTE, 'Pode ser sim, CPF 390.533.447-05')
  confere('repasse: quem falou recebe em texto', c.enviados.find((e) => e.para === DRA)?.conteudo.type === 'text' && c.para(DRA)[0].includes('Maria Teste da Silva respondeu') && c.para(DRA)[0].includes('Pode ser sim'), JSON.stringify(c.para(DRA)))
  confere('repasse: CPF nao vai ao celular', !c.para(DRA)[0].includes('390.533') && !c.para(EQUIPE)[0].includes('390.533'), c.para(DRA)[0])
  const modelo = c.enviados.find((e) => e.para === EQUIPE)?.conteudo
  confere('repasse: o outro numero recebe pelo modelo aprovado', modelo?.type === 'template' && modelo.template.name === 'aviso_duvida_paciente' && modelo.template.components[0].parameters.length === 3, JSON.stringify(modelo))
  confere('repasse: o paciente nao recebe nada', c.para(PACIENTE).length === 0)
  const a = c.banco.db.alertas_de_urgencia[0]
  confere('repasse: guarda os ids, para a resposta em cima achar o aviso', a.mensagens.length === 3 && a.mensagens[0] === 'wamid.AVISO1', JSON.stringify(a.mensagens))
  confere('repasse: guarda quando', a.repasse_em === AGORA.toISOString() && a.repasse_modelo_em === AGORA.toISOString(), JSON.stringify(a))
  confere('repasse: evento nos numeros', c.banco.db.whatsapp_bot_events.some((x) => x.evento === 'repasse_ao_celular' && x.detalhe === 'enviado 2'))

  // A Dra. responde em cima do repasse.
  const antes = c.enviados.length
  await tratarRespostaDaEquipe(c.amb, DRA, texto('Ótimo, sexta às 14h', a.mensagens[1]))
  confere('repasse: resposta em cima vira rascunho do paciente certo', c.banco.db.alertas_de_urgencia[0].rascunho === 'Ótimo, sexta às 14h' && c.enviados.length === antes + 1)

  // Segunda mensagem em seguida: o modelo nao sai de novo, o texto sim.
  const segundo = await repasseAberto(c.banco, 'c1', 'conv-1', AGORA)
  const n = c.para(EQUIPE).length
  await repassarAoCelular(c.amb, segundo, 'conv-1', PACIENTE, 'E levo os exames?')
  confere('repasse: modelo no maximo um a cada 6 h', c.para(EQUIPE).length === n, JSON.stringify(c.para(EQUIPE)))
  confere('repasse: o texto continua saindo', c.para(DRA).some((t) => t.includes('E levo os exames?')))
}
{
  const aberto = (extra = {}) => alerta({ repasse_por: DRA, repasse_aberto_em: haMinutos(60), repasse_modelo_em: null, ...extra })
  // Passou da janela de quem falou: texto falharia calado, vai pelo modelo.
  const c = cenario({ alertas: [aberto({ repasse_aberto_em: haMinutos(30 * 60) })] })
  await repassarAoCelular(c.amb, await repasseAberto(c.banco, 'c1', 'conv-1', AGORA), 'conv-1', PACIENTE, 'Oi')
  confere('repasse: depois de 23 h ela tambem vai pelo modelo', c.enviados.find((e) => e.para === DRA)?.conteudo.type === 'template')
  // Passou das 48 horas: acabou.
  const v = cenario({ alertas: [aberto({ repasse_aberto_em: haMinutos(49 * 60) })] })
  confere('repasse: depois de 48 h fica so na Central', (await repasseAberto(v.banco, 'c1', 'conv-1', AGORA)) === null)
  // A equipe testando pelo proprio numero nao recebe a si mesma.
  const t = cenario({ alertas: [aberto()] })
  await repassarAoCelular(t.amb, await repasseAberto(t.banco, 'c1', 'conv-1', AGORA), 'conv-1', EQUIPE, 'Oi')
  confere('repasse: nao manda para o proprio remetente', t.para(EQUIPE).length === 0 && t.para(DRA).length === 1)
  // Falha grita na conversa.
  const f = cenario({ alertas: [aberto()] })
  f.amb.enviarWhatsApp = async () => ({ ok: false, erro: 'Meta fora do ar' })
  await repassarAoCelular(f.amb, await repasseAberto(f.banco, 'c1', 'conv-1', AGORA), 'conv-1', PACIENTE, 'Oi')
  confere('repasse: falha vira nota', f.notas().some((x) => x.startsWith('⚠️ A resposta do paciente NÃO chegou') && x.includes('Meta fora do ar')), JSON.stringify(f.notas()))
  confere('repasse: falha vira evento', f.banco.db.whatsapp_bot_events.some((x) => x.detalhe.startsWith('falhou 2')))
  // Sem a migration: nulo, e o atendimento segue.
  const s = cenario({ semTabela: ['alertas_de_urgencia'] })
  confere('repasse: sem a tabela devolve nulo', (await repasseAberto(s.banco, 'c1', 'conv-1', AGORA)) === null)
  // Sem citar, a janela de 6 h conta do repasse, com o aviso ja velho.
  const velho = alerta({ criado_em: haMinutos(30 * 60), repasse_aberto_em: haMinutos(29 * 60), repasse_por: DRA, repasse_em: haMinutos(60) })
  const j = cenario({ alertas: [velho] })
  const tratou = await tratarRespostaDaEquipe(j.amb, DRA, texto('Pode vir sexta'))
  confere('repasse: resposta sem citar vale por 6 h do repasse', tratou && j.banco.db.alertas_de_urgencia[0].rascunho === 'Pode vir sexta', JSON.stringify(j.banco.db.alertas_de_urgencia[0]))
  confere('repasse: aviso velho sem repasse nao vale', escolherAlerta([alerta({ criado_em: haMinutos(30 * 60) })], null, AGORA) === null)
}
confere('repasse: audio vira aviso de ver na Central', oQueOPacienteDisse({ type: 'audio' }, '[audio]') === 'Mandou áudio, foto ou arquivo: veja na Central.')
confere('repasse: mensagem sem conteudo nao vai', oQueOPacienteDisse({ type: 'unsupported' }, 'x') === null && oQueOPacienteDisse({ type: 'text' }, '  ') === null)
confere('repasse: texto longo cabe na mensagem', textoDoRepasse('Maria', 'x'.repeat(5000)).length < 1024)

// 6. Audio, foto e arquivo (05/11/2026). O caso de 03/11: a Dra. respondeu um
// aviso com audio e o paciente ficou sem a resposta.
const audioDela = (citado = 'wamid.AVISO1') => ({ type: 'audio', audio: { id: 'aud1', mime_type: 'audio/ogg; codecs=opus' }, ...(citado ? { context: { id: citado } } : {}) })
confere('midia: le o audio com o id e o tipo', JSON.stringify(midiaRecebida(audioDela())) === JSON.stringify({ tipo: 'audio', id: 'aud1', mime: 'audio/ogg; codecs=opus' }), JSON.stringify(midiaRecebida(audioDela())))
confere('midia: foto leva a legenda', midiaRecebida({ type: 'image', image: { id: 'f1', caption: ' Receita antiga ' } })?.legenda === 'Receita antiga')
confere('midia: sem id, figurinha ou texto, nada', midiaRecebida({ type: 'audio', audio: {} }) === null && midiaRecebida({ type: 'sticker', sticker: { id: 's' } }) === null && midiaRecebida({ type: 'text' }) === null)
confere('midia: lida como midia na resposta', lerRespostaDaEquipe(audioDela())?.midia?.id === 'aud1')
confere('midia: audio vai sem legenda; documento com o nome', JSON.stringify(conteudoDaMidia({ tipo: 'voice' }, 'n1', 'x')) === JSON.stringify({ type: 'audio', audio: { id: 'n1' } }) && conteudoDaMidia({ tipo: 'document', nome: 'exame.pdf' }, 'n2', 'oi').document.filename === 'exame.pdf')
confere('midia: o rascunho guarda e devolve o arquivo', midiaDoRascunho(rascunhoDeMidia({ tipo: 'audio', id: 'aud1' }))?.id === 'aud1' && midiaDoRascunho('midia: ligar amanhã') === null && midiaDoRascunho('Pode vir') === null)
confere('midia: tipo sem parametro para a Meta', tipoLimpo('audio/ogg; codecs=opus') === 'audio/ogg' && tipoLimpo(undefined) === 'application/octet-stream')
{
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, audioDela())
  const pergunta = c.enviados.at(-1)
  confere('audio: pergunta antes, com Enviar e Cancelar', pergunta.para === DRA && pergunta.conteudo.type === 'interactive' && c.textoDe(pergunta).startsWith('Vou mandar este áudio para Maria, como mensagem da Dra. Patrícia'), c.textoDe(pergunta))
  confere('audio: nada sai antes do Enviar', c.para(PACIENTE).length === 0 && c.copias.length === 0)
  confere('audio: fica como rascunho dela', midiaDoRascunho(c.banco.db.alertas_de_urgencia[0].rascunho)?.id === 'aud1' && c.banco.db.alertas_de_urgencia[0].rascunho_de === DRA)

  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:enviar`))
  const aoPaciente = c.enviados.filter((e) => e.para === PACIENTE)
  confere('audio: o paciente recebe de quem e e o audio', aoPaciente.length === 2 && c.textoDe(aoPaciente[0]) === '🎤 Áudio da Dra. Patrícia:' && aoPaciente[1].conteudo.type === 'audio' && aoPaciente[1].conteudo.audio.id === 'novo-aud1', JSON.stringify(aoPaciente))
  confere('audio: copiado uma vez', c.copias.length === 1)
  const audioNaConversa = c.saidas().find((m) => m.message_type === 'audio')
  confere('audio: fica na conversa, com o arquivo para ouvir na Central', audioNaConversa?.body === '🎤 Áudio da Dra. Patrícia' && Boolean(audioNaConversa.media_path) && audioNaConversa.media_mime === 'audio/ogg' && audioNaConversa.automatic === false && c.acervo[0]?.balde === 'whatsapp-anexos', JSON.stringify(audioNaConversa))
  confere('audio: ela fica sabendo que foi', c.para(DRA).at(-1) === '✅ Enviado para Maria Teste da Silva.', c.para(DRA).at(-1))
  confere('audio: nota na conversa', c.notas().some((n) => n.includes('respondeu ao aviso pelo WhatsApp: mandou um áudio.')), JSON.stringify(c.notas()))
  confere('audio: abre o repasse e limpa o rascunho', c.banco.db.alertas_de_urgencia[0].repasse_por === DRA && c.banco.db.alertas_de_urgencia[0].rascunho === null)

  const antes = c.enviados.length
  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('audio: dois toques nao mandam duas vezes', c.enviados.filter((e) => e.para === PACIENTE).length === 2 && c.textoDe(c.enviados.at(-1)).startsWith('Não achei a mensagem para enviar') && c.enviados.length === antes + 1 && c.copias.length === 1, c.textoDe(c.enviados.at(-1)))
}
{
  // Foto com legenda: a legenda vai junto, com o nome dela na frente.
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, DRA, { type: 'image', image: { id: 'f1', mime_type: 'image/jpeg', caption: 'Traga este exame' }, context: { id: 'wamid.AVISO1' } })
  confere('foto: a pergunta diz a legenda', c.textoDe(c.enviados.at(-1)).includes('esta foto') && c.textoDe(c.enviados.at(-1)).includes('"Traga este exame"'), c.textoDe(c.enviados.at(-1)))
  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:enviar`))
  const aoPaciente = c.enviados.filter((e) => e.para === PACIENTE)
  confere('foto: uma mensagem so, com a legenda', aoPaciente.length === 1 && aoPaciente[0].conteudo.type === 'image' && aoPaciente[0].conteudo.image.caption === '💬 Mensagem da Dra. Patrícia: Traga este exame', JSON.stringify(aoPaciente))
}
{
  // A equipe tambem pode; o paciente le que e da equipe.
  const c = cenario()
  await tratarRespostaDaEquipe(c.amb, EQUIPE, audioDela())
  await tratarRespostaDaEquipe(c.amb, EQUIPE, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('audio da equipe: assinado pela equipe', c.para(PACIENTE)[0] === '🎤 Áudio da equipe do consultório:', JSON.stringify(c.para(PACIENTE)))
  // Outra pessoa nao confirma o audio dela.
  const o = cenario()
  await tratarRespostaDaEquipe(o.amb, DRA, audioDela())
  await tratarRespostaDaEquipe(o.amb, EQUIPE, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('audio: so quem mandou confirma', o.para(PACIENTE).length === 0 && o.para(EQUIPE).at(-1)?.startsWith('Essa mensagem foi escrita por outra pessoa'))
  // Cancelar: nada sai.
  const k = cenario()
  await tratarRespostaDaEquipe(k.amb, DRA, audioDela())
  await tratarRespostaDaEquipe(k.amb, DRA, toqueInterativo(`PEDTXT:${A1}:cancelar`))
  confere('audio: cancelar nao manda nada', k.para(PACIENTE).length === 0 && k.copias.length === 0 && k.banco.db.alertas_de_urgencia[0].rascunho === null)
}
{
  // Janela fechada: a Meta so aceita modelo, e modelo nao leva arquivo. Diz na hora.
  const c = cenario({ ultimaDoPaciente: haMinutos(30 * 60) })
  await tratarRespostaDaEquipe(c.amb, DRA, audioDela())
  confere('audio, janela fechada: diz na hora, sem perguntar', c.para(DRA).at(-1)?.startsWith('Não dá para mandar este áudio: o paciente não escreve há mais de 24 horas') && c.enviados.at(-1).conteudo.type === 'text', c.para(DRA).at(-1))
  confere('audio, janela fechada: nada guardado nem enviado', c.para(PACIENTE).length === 0 && c.banco.db.alertas_de_urgencia[0].rascunho === null && c.copias.length === 0)
  confere('audio, janela fechada: vira nota', c.notas().some((n) => n.includes('mandou um áudio em resposta ao aviso, mas o paciente não escreve há mais de 24 horas')), JSON.stringify(c.notas()))
}
{
  // A Meta nao entrega o arquivo: grita, para ela e na conversa.
  const c = cenario({ copiaFalha: 'a Meta não entregou o arquivo (HTTP 404)' })
  await tratarRespostaDaEquipe(c.amb, DRA, audioDela())
  await tratarRespostaDaEquipe(c.amb, DRA, toqueInterativo(`PEDTXT:${A1}:enviar`))
  confere('audio, copia falhou: ela fica sabendo', c.para(DRA).at(-1) === '⚠️ Não consegui enviar: a Meta não entregou o arquivo (HTTP 404). Responda pela Central.', c.para(DRA).at(-1))
  confere('audio, copia falhou: nada ao paciente, a nota diz que nao chegou', c.para(PACIENTE).length === 0 && c.notas().some((n) => n.includes('NÃO chegou ao paciente')))
  // Sem o copiador: o aviso de que nao deu, e nada guardado.
  const s = cenario()
  delete s.amb.copiarMidia
  await tratarRespostaDaEquipe(s.amb, DRA, audioDela())
  confere('audio, sem copiador: avisa e nao guarda rascunho', s.para(DRA).at(-1)?.startsWith('Não consegui ler esse arquivo') && s.banco.db.alertas_de_urgencia[0].rascunho === null)
}
{
  // Paciente responde com audio: quem falou com ele recebe o audio, e nao "veja na Central".
  const aberto = alerta({ repasse_por: DRA, repasse_aberto_em: haMinutos(60), repasse_modelo_em: null })
  const c = cenario({ alertas: [aberto] })
  const midia = midiaRecebida({ type: 'audio', audio: { id: 'pac1', mime_type: 'audio/ogg; codecs=opus' } })
  await repassarAoCelular(c.amb, await repasseAberto(c.banco, 'c1', 'conv-1', AGORA), 'conv-1', PACIENTE, oQueOPacienteDisse({ type: 'audio' }, ''), midia)
  const aDra = c.enviados.filter((e) => e.para === DRA)
  confere('repasse de audio: o aviso e o audio para quem falou', aDra.length === 2 && c.textoDe(aDra[0]).startsWith('💬 Maria Teste da Silva respondeu com um áudio:') && aDra[1].conteudo.type === 'audio' && aDra[1].conteudo.audio.id === 'novo-pac1', JSON.stringify(aDra))
  const modelo = c.enviados.find((e) => e.para === EQUIPE)?.conteudo
  confere('repasse de audio: o outro numero, pelo modelo, le "veja na Central"', modelo?.type === 'template' && JSON.stringify(modelo).includes('veja na Central'))
  confere('repasse de audio: copia uma vez so', c.copias.length === 1)
  const a = c.banco.db.alertas_de_urgencia[0]
  confere('repasse de audio: os ids entram, para ela responder em cima do audio', a.mensagens.length === 4, JSON.stringify(a.mensagens))
  // E ela responde em cima do audio do paciente com outro audio.
  await tratarRespostaDaEquipe(c.amb, DRA, { type: 'audio', audio: { id: 'aud2' }, context: { id: a.mensagens[2] } })
  confere('repasse de audio: audio em cima do audio vira rascunho do paciente certo', midiaDoRascunho(c.banco.db.alertas_de_urgencia[0].rascunho)?.id === 'aud2')
  // Copia falhou: cai no texto de antes.
  const f = cenario({ alertas: [aberto], copiaFalha: 'HTTP 500' })
  await repassarAoCelular(f.amb, await repasseAberto(f.banco, 'c1', 'conv-1', AGORA), 'conv-1', PACIENTE, oQueOPacienteDisse({ type: 'audio' }, ''), midia)
  confere('repasse de audio, copia falhou: o celular fica sabendo pela Central', f.para(DRA).length === 1 && f.para(DRA)[0].includes('veja na Central'), JSON.stringify(f.para(DRA)))
}
confere('repasse de foto: legenda sem CPF', textoDoRepasseDeMidia('Maria', { tipo: 'image', legenda: 'meu CPF 390.533.447-05' }).includes('[cpf]'))
{
  // A copia de verdade, com a Meta de mentira: id -> URL -> bytes -> upload.
  const chamadas = []
  const buscar = async (url, init = {}) => {
    chamadas.push({ url, metodo: init.method ?? 'GET', corpo: init.body })
    if (url.endsWith('/aud1')) return new Response(JSON.stringify({ url: 'https://lookaside.fbsbx.com/x', mime_type: 'audio/ogg; codecs=opus' }))
    if (url.startsWith('https://lookaside')) return new Response(new Uint8Array([9, 8, 7]))
    if (url.endsWith('/123/media')) return new Response(JSON.stringify({ id: 'subido-1' }))
    return new Response('{}', { status: 404 })
  }
  const r = await copiaPelaApi('123', 'token-de-teste', buscar)({ tipo: 'audio', id: 'aud1', mime: 'audio/ogg; codecs=opus' })
  confere('copia: devolve o id novo e os bytes', r.ok && r.id === 'subido-1' && r.bytes.length === 3 && r.mime === 'audio/ogg', JSON.stringify(r))
  confere('copia: busca o endereco, baixa e sobe pelo numero da clinica', chamadas.length === 3 && chamadas[2].metodo === 'POST' && chamadas[2].corpo instanceof FormData && chamadas[2].corpo.get('type') === 'audio/ogg' && chamadas[2].corpo.get('messaging_product') === 'whatsapp')
  const semToken = await copiaPelaApi('123', undefined, buscar)({ tipo: 'audio', id: 'aud1' })
  confere('copia: sem token diz o motivo', !semToken.ok && semToken.erro.includes('sem token'))
  const recusada = await copiaPelaApi('123', 't', async () => new Response(JSON.stringify({ error: { message: 'Invalid media id' } }), { status: 400 }))({ tipo: 'audio', id: 'x' })
  confere('copia: id recusado volta escrito', !recusada.ok && recusada.erro.includes('Invalid media id'))
}

console.log(`resposta ao aviso: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}

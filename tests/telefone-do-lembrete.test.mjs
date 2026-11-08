// Etiqueta "Sem telefone" da Agenda (21/10/2026, porte do sistema do Dr.
// Marcello): a mesma regra do lembrete.
// Dados inventados: o repositorio e publico.
import { telefoneDoLembrete, problemaNoWhatsapp } from './telefone-do-lembrete.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

const pacientes = [
  { id: 'p1', telefone: '(13) 91234-5678' },
  { id: 'p2', telefone: '' },
]

// Real 21/10: o robo criou o cadastro depois de a Agenda abrir; o paciente nao
// estava na lista e a etiqueta dizia "Sem telefone" para quem marcou pelo WhatsApp.
confere('paciente fora da lista da tela: vale o telefone de quem marcou',
  telefoneDoLembrete({ patientId: 'novo', contactPhone: '5513998765432' }, pacientes) === '5513998765432')
confere('cadastro com telefone: vale o do cadastro',
  telefoneDoLembrete({ patientId: 'p1', contactPhone: '5513998765432' }, pacientes) === '(13) 91234-5678')
confere('cadastro sem telefone: vale o de quem marcou, como no lembrete',
  telefoneDoLembrete({ patientId: 'p2', contactPhone: '5513998765432' }, pacientes) === '5513998765432')
confere('sem paciente: o de quem marcou', telefoneDoLembrete({ patientId: null, contactPhone: ' 5513998765432 ' }, pacientes) === '5513998765432')
confere('sem nenhum telefone: vazio (a etiqueta aparece)', telefoneDoLembrete({ patientId: 'p2', contactPhone: '' }, pacientes) === '')
confere('contato nulo nao quebra', telefoneDoLembrete({ patientId: null, contactPhone: null }, pacientes) === '')

// WhatsApp digitado na agenda (07/11/2026, portado do sistema do Dr. Marcello,
// onde um celular com dois digitos a mais no fim entrou na agenda e o lembrete
// foi para um numero que nao existe). Numeros inventados.
const ruim = problemaNoWhatsapp('(13) 99123-456712')
confere('celular com dois digitos a mais e recusado', ruim !== null, String(ruim))
confere('a mensagem diz quantos numeros tem', /13 números/.test(ruim ?? ''), String(ruim))
confere('digito a menos tambem', problemaNoWhatsapp('13 9912-345') !== null)
confere('celular com 9 passa', problemaNoWhatsapp('(13) 99123-4567') === null)
confere('com o 55 do pais passa', problemaNoWhatsapp('+55 13 99123-4567') === null)
confere('celular antigo sem o 9 passa (o envio poe o 9)', problemaNoWhatsapp('13 9123-4567') === null)
confere('fixo passa', problemaNoWhatsapp('(13) 3273-6828') === null)
confere('vazio passa: a agenda ja avisa que fica sem lembrete', problemaNoWhatsapp('') === null && problemaNoWhatsapp(null) === null)
confere('DDD com zero e recusado', problemaNoWhatsapp('03 99123-4567') !== null)
confere('11 numeros sem o 9 depois do DDD e recusado', problemaNoWhatsapp('13 89123-4567') !== null)
confere('DDD 55 (Santa Maria) com 11 numeros passa', problemaNoWhatsapp('55 99123-4567') === null)

console.log(`telefone do lembrete: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}

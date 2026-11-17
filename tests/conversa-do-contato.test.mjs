// Icone do WhatsApp na Agenda (porte de 17/11/2026 do sistema do Dr. Marcello;
// la, 10/11/2026): qual conversa abrir.
// Numeros e nomes inventados: nada de paciente real aqui.
import { conversaDoContato, temComoAcharConversa } from './conversa-do-contato.build.mjs'

let ok = 0
const falhas = []
const confere = (nome, cond, detalhe = '') => (cond ? ok++ : falhas.push(`${nome} ${detalhe}`))

// Da mais recente para a mais antiga, como a tela de Conversas recebe.
const conversas = [
  { id: 'paciente', patientId: 'p1', phoneDigits: '5511987650001' },
  { id: 'filha', patientId: 'p1', phoneDigits: '551391230002' }, // sem o nono digito, como a Meta entrega
  { id: 'avulsa', patientId: null, phoneDigits: '5513998760003' },
  { id: 'casal', patientId: 'p2', phoneDigits: '5513991110004' },
  { id: 'vazia', patientId: null, phoneDigits: '' },
]
const id = (contato) => conversaDoContato(conversas, contato)?.id ?? null

confere('paciente com duas conversas: abre a do numero do lembrete, nao a mais recente',
  id({ patientId: 'p1', telefone: '(13) 99123-0002' }) === 'filha', String(id({ patientId: 'p1', telefone: '(13) 99123-0002' })))
confere('cadastro com 11 digitos acha a conversa que a Meta gravou com 12 (nono digito)',
  id({ patientId: null, telefone: '13991230002' }) === 'filha')
confere('com o 55 e com mascara tambem', id({ patientId: null, telefone: '+55 (13) 99876-0003' }) === 'avulsa')
confere('sem cadastro vinculado: acha pelo telefone de quem marcou',
  id({ patientId: null, telefone: '13 99876-0003' }) === 'avulsa')
confere('conjuge sem vinculo na conversa: acha pelo telefone da filha',
  id({ patientId: 'p3', telefone: '(13) 99111-0004' }) === 'casal')
confere('telefone sem conversa: cai no cadastro',
  id({ patientId: 'p2', telefone: '(13) 99000-9999' }) === 'casal')
confere('cadastro sem telefone: cai no cadastro, a conversa mais recente',
  id({ patientId: 'p1', telefone: '' }) === 'paciente')
confere('mesmo final com outro DDD nao e a mesma pessoa',
  id({ patientId: null, telefone: '(11) 99876-0003' }) === null)
confere('numero sem DDD nao casa com ninguem', id({ patientId: null, telefone: '99876-0003' }) === null)
confere('sem telefone e sem cadastro: nada', id({ patientId: null, telefone: '' }) === null)
confere('telefone nulo nao quebra', id({ patientId: null, telefone: null }) === null)
confere('conversa sem numero nunca casa', id({ patientId: null, telefone: '(13) 99000-9999' }) === null)
confere('ninguem na lista: nada', conversaDoContato([], { patientId: 'p1', telefone: '13991230002' }) === null)

confere('icone aparece com cadastro', temComoAcharConversa({ patientId: 'p1', telefone: '' }) === true)
confere('icone aparece so com telefone', temComoAcharConversa({ patientId: null, telefone: '(13) 99123-0002' }) === true)
confere('icone some sem cadastro e sem numero', temComoAcharConversa({ patientId: null, telefone: '' }) === false)
confere('icone some com numero sem DDD', temComoAcharConversa({ patientId: null, telefone: '9123-0002' }) === false)

console.log(`conversa do contato: ${ok} verificacoes ok`)
if (falhas.length) {
  for (const f of falhas) console.log('✗ ' + f)
  process.exit(1)
}

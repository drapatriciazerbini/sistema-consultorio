// O nome do arquivo do paciente no celular da Dra. (porte de 20/11/2026 do
// sistema do Dr. Marcello, 13/11). Regra em
// supabase/functions/_shared/rotulo-do-anexo.ts. Dados inventados.
import assert from 'node:assert/strict'
import { classeDoAnexo, familiaDoTipo, nomeDoArquivo, rotuloDoAnexo } from './rotulo-do-anexo.build.mjs'

let ok = 0
function caso(nome, fn) {
  try {
    fn()
    ok++
  } catch (erro) {
    console.error('FALHOU:', nome)
    throw erro
  }
}

caso('audio e video nao dependem do que o paciente escreveu', () => {
  assert.equal(classeDoAnexo('audio', 'segue o exame'), 'Áudio')
  assert.equal(classeDoAnexo('voice', ''), 'Áudio')
  assert.equal(classeDoAnexo('video', 'receita'), 'Vídeo')
  assert.equal(familiaDoTipo('sticker'), null)
})

caso('sem pista: foto e documento, nunca um rotulo inventado', () => {
  assert.equal(classeDoAnexo('image', ''), 'Foto')
  assert.equal(classeDoAnexo('image', 'olha como ela esta'), 'Foto')
  assert.equal(classeDoAnexo('document', '9adbbdb1-187c-43d3-b424-957b38854988.pdf'), 'Documento')
  assert.equal(classeDoAnexo('document', null), 'Documento')
})

caso('exame: pela mensagem ou pelo nome do arquivo, inclusive os do idoso', () => {
  assert.equal(classeDoAnexo('document', 'Segue os exames da minha mãe, junto com o Raio x.'), 'Exame')
  assert.equal(classeDoAnexo('document', 'DENSITOMETRIA OSSEA'), 'Exame')
  assert.equal(classeDoAnexo('image', 'o eletrocardiograma do meu pai'), 'Exame')
  assert.equal(classeDoAnexo('document', 'laudo.pdf'), 'Exame')
  assert.equal(classeDoAnexo('image', 'resultado do hemograma'), 'Exame')
})

caso('receita e ficha; a ficha ganha quando a frase fala das duas', () => {
  assert.equal(classeDoAnexo('image', 'a farmacia nao aceitou a receita'), 'Receita')
  assert.equal(classeDoAnexo('document', 'prescrição antiga'), 'Receita')
  assert.equal(classeDoAnexo('document', 'a farmácia exigiu que a médica preencha essa ficha, após o envio da receita'), 'Ficha')
  assert.equal(classeDoAnexo('document', 'relatório para o INSS'), 'Ficha')
})

caso('palavra parecida nao vira pista', () => {
  assert.equal(classeDoAnexo('image', 'a senhora pode examinar?'), 'Foto')
  assert.equal(classeDoAnexo('document', 'arquivo do prx mes'), 'Documento')
})

caso('rotulo com e sem numero', () => {
  assert.equal(rotuloDoAnexo('document', 'exames', 2), 'Exame 2')
  assert.equal(rotuloDoAnexo('document', 'exames'), 'Exame')
  assert.equal(rotuloDoAnexo('document', 'exames', 0), 'Exame')
  assert.equal(rotuloDoAnexo('audio', '', 3), 'Áudio 3')
})

caso('nome do documento: rotulo, paciente e a extensao original', () => {
  assert.equal(nomeDoArquivo('Exame', 'Maria Aparecida Souza', '9adbbdb1-187c.pdf'), 'Exame - Maria Aparecida Souza.pdf')
  assert.equal(nomeDoArquivo('Documento', 'Antônio', 'WhatsApp Scan 2026-11-11 at 09.35.20.PDF'), 'Documento - Antônio.pdf')
  assert.equal(nomeDoArquivo('Documento', '', 'documento'), 'Documento')
  assert.equal(nomeDoArquivo('Exame', 'Rosa/Lia: filha', 'x.docx'), 'Exame - Rosa Lia filha.docx')
  assert.equal(nomeDoArquivo('Exame', 'Rosa', null), 'Exame - Rosa')
})

console.log('rotulo do anexo: ' + ok + ' casos passaram')

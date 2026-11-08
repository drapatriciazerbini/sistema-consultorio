// De onde a conversa veio (supabase/functions/_shared/origem-do-anuncio.ts).
// Pedido de 19/10/2026: saber quem chegou pelo Google.
import assert from 'node:assert/strict'
import { origemDoAnuncio } from './origem-do-anuncio.build.mjs'

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

const DO_SITE = 'Olá! Encontrei a Dra. Patrícia Zerbini no Google e gostaria de informações sobre uma consulta.'

caso('referral com link do Instagram: instagram, com titulo e link', () => {
  const r = origemDoAnuncio(
    { source_url: 'https://www.instagram.com/p/DAbc123/', source_type: 'ad', source_id: '120250812631280082', headline: 'Geriatra em Santos' },
    'oi',
  )
  assert.deepEqual(r, {
    origem: 'instagram',
    titulo: 'Geriatra em Santos',
    url: 'https://www.instagram.com/p/DAbc123/',
    anuncioId: '120250812631280082',
  })
})

// 07/11/2026: o codigo junta quem chegou ao gasto do anuncio (aba Campanha).
// Em post impulsionado o source_id e do post, nao de anuncio com gasto proprio.
caso('codigo do anuncio so quando a Meta diz que veio de anuncio', () => {
  assert.equal(origemDoAnuncio({ source_url: 'https://www.instagram.com/p/1', source_type: 'post', source_id: '17890001112223334' }, 'oi')?.anuncioId, null)
  assert.equal(origemDoAnuncio({ source_url: 'https://fb.me/abc', source_type: 'ad', source_id: '120250812631280082' }, 'oi')?.anuncioId, '120250812631280082')
  assert.equal(origemDoAnuncio({ source_type: 'ad', source_id: 'nao-e-codigo' }, 'oi')?.anuncioId, null)
  assert.equal(origemDoAnuncio(undefined, DO_SITE)?.anuncioId, null)
})

caso('referral com link do Facebook: facebook', () => {
  assert.equal(origemDoAnuncio({ source_url: 'https://www.facebook.com/123/posts/1', source_type: 'post' }, 'oi')?.origem, 'facebook')
})

caso('referral com link curto fb.me: meta, sem chutar a plataforma', () => {
  assert.equal(origemDoAnuncio({ source_url: 'https://fb.me/abc', source_type: 'ad' }, 'oi')?.origem, 'meta')
})

caso('referral so com ctwa_clid, sem link: meta', () => {
  assert.deepEqual(origemDoAnuncio({ ctwa_clid: 'ARAx' }, 'oi'), { origem: 'meta', titulo: null, url: null, anuncioId: null })
})

caso('referral manda mais que o texto', () => {
  assert.equal(origemDoAnuncio({ source_url: 'https://instagram.com/p/1' }, DO_SITE)?.origem, 'instagram')
})

caso('frase do site para quem veio do Google: google', () => {
  assert.equal(origemDoAnuncio(undefined, DO_SITE)?.origem, 'google')
  assert.equal(origemDoAnuncio(undefined, 'encontrei a dra patricia no google')?.origem, 'google')
  assert.equal(origemDoAnuncio(null, 'ENCONTREI A PATRÍCIA NO GOOGLE')?.origem, 'google')
})

caso('frase comum do site nao e Google', () => {
  assert.equal(origemDoAnuncio(undefined, 'Olá! Gostaria de informações sobre uma consulta com a Dra. Patrícia Zerbini.'), null)
})

caso('mensagem comum: sem origem', () => {
  assert.equal(origemDoAnuncio(undefined, 'Bom dia, quero marcar consulta'), null)
  assert.equal(origemDoAnuncio({}, 'oi'), null)
})

caso('titulo longo e cortado', () => {
  assert.equal(origemDoAnuncio({ source_url: 'https://instagram.com/p/1', headline: 'x'.repeat(400) }, '')?.titulo?.length, 160)
})

console.log(`origem do anuncio: ${ok} verificacoes ok`)

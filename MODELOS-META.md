# Modelos da Meta, consultório da Dra. Patrícia Zerbini

Três modelos para submeter no WhatsApp Manager, em Ferramentas de conta,
Modelos de mensagem, Criar modelo. Idioma **Português (BR)**, categoria
**Utilidade** nos três.

O texto aqui é o mesmo que está em
`supabase/functions/_shared/modelos.ts`. Se a Meta pedir alteração, ou você
mudar uma palavra na aprovação, o arquivo precisa acompanhar: é dele que sai
a mensagem mostrada na tela de conversas.

---

## 1. acompanhamento_pos_consulta

Nome: `acompanhamento_pos_consulta`
Categoria: Utilidade
Idioma: Português (BR)

**Corpo**

```
Olá, {{1}}. Aqui é o consultório da Dra. Patrícia Zerbini. Estamos acompanhando a consulta realizada em {{2}}. Como estão as coisas desde então? Responda esta mensagem se precisar falar com a equipe.
```

**Rodapé**

```
Para não receber novos acompanhamentos, responda SAIR.
```

**Botões** (resposta rápida, nesta ordem)

```
Estou bem
Preciso de ajuda
Não quero receber
```

**Exemplos que a Meta pede**

- {{1}} = Maria Aparecida
- {{2}} = 02/09/2026

---

## 2. lembrete_consulta

Nome: `lembrete_consulta`
Categoria: Utilidade
Idioma: Português (BR)

**Corpo**

```
Olá, {{1}}. Lembrete da consulta com a Dra. Patrícia Zerbini em {{2}}, às {{3}}, {{4}}. Podemos confirmar a presença?
```

**Botões** (resposta rápida, nesta ordem)

```
Confirmar presença
Preciso remarcar
```

**Exemplos que a Meta pede**

- {{1}} = Maria Aparecida
- {{2}} = terça, 22/09
- {{3}} = 14:30
- {{4}} = no consultório, no Gonzaga

O {{4}} recebe o nome da unidade cadastrada na agenda. Como a Dra. Patrícia
atende dos dois jeitos, os nomes das unidades precisam completar a frase
sozinhos. Cadastre assim:

- `no consultório, no Gonzaga`
- `em visita domiciliar`

---

## 3. resposta_da_clinica

Nome: `resposta_da_clinica`
Categoria: Utilidade
Idioma: Português (BR)

**Corpo**

```
Olá, {{1}}. Aqui é o consultório da Dra. Patrícia Zerbini.

{{2}}

Se precisar, é só responder por aqui.
```

Sem rodapé e sem botões.

**Exemplos que a Meta pede**

- {{1}} = Maria Aparecida
- {{2}} = A receita foi assinada e enviada para o seu e-mail.

Este é o modelo que a equipe usa para responder alguém que escreveu há mais
de 24 horas. O {{2}} é o texto digitado na tela.

---

## Sobre os rótulos dos botões

O sistema não manda um código junto com o botão: quando o paciente toca, a
Meta devolve o próprio rótulo, e o robô lê esse texto.

Desde 14/09/2026 ele entende por palavra contida, e não por texto exato, nos
dois sistemas. Então "Confirmar", "Confirmar presença" e até "quero confirmar
minha consulta" chegam no mesmo lugar. As palavras que ele procura são
confirmar, remarcar ou reagendar, cancelar ou desmarcar, preciso de ajuda,
estou bem, e não quero receber. Uma negação na frase bloqueia a ação: "não
posso confirmar" não confirma, vai para a equipe.

Ou seja, se a Meta sugerir outro rótulo na hora da aprovação, aceite sem
medo, desde que a palavra principal continue lá. Só me diga qual ficou, para
eu igualar a cópia em `modelos.ts`: ela existe só para a tela de conversas
mostrar o botão que o paciente viu. Se divergir, a tela exibe um botão que
não existe. É cosmético, não quebra nada.

## Por que um modelo é recusado

- Categoria errada. Lembrete e acompanhamento são Utilidade. Se marcar
  Marketing, a Meta cobra mais e o envio depende de outro consentimento.
- Variável colada em outra, ou no fim da frase sem texto depois.
- Exemplos de preenchimento vazios ou genéricos demais.
- Promessa de resultado de tratamento. Os textos acima não têm nenhuma.

A análise costuma levar de alguns minutos a alguns dias. Enquanto os três não
estiverem aprovados, o sistema só consegue falar com quem escreveu nas
últimas 24 horas.

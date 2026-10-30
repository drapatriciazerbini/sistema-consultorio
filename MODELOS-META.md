# Modelos da Meta, consultório da Dra. Patrícia Zerbini

Sete modelos para submeter no WhatsApp Manager, em Ferramentas de conta,
Modelos de mensagem, Criar modelo. Idioma **Português (BR)**, categoria
**Utilidade** em todos. Os modelos 6 e 7 (27/10/2026) são os do aviso no
WhatsApp pessoal da Dra. Patrícia e ainda não foram submetidos.

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
Olá, {{1}}. Lembrete da consulta com a Dra. Patrícia Zerbini em {{2}}, às {{3}}. Local: {{4}}. Podemos confirmar a presença?
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
- {{4}} = Consultório (Gonzaga)

O {{4}} recebe o nome da unidade cadastrada na agenda. Como ele entra depois de
"Local:", o nome pode ser curto e legível também na tela:

- `Consultório (Gonzaga)`
- `Visita domiciliar`

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

## 4. consulta_cancelada

Nome: `consulta_cancelada`
Categoria: Utilidade
Idioma: Português (BR)

**Corpo**

```
Olá, {{1}}. Precisamos cancelar a consulta com a Dra. Patrícia Zerbini marcada para {{2}}. Motivo: {{3}}. Responda esta mensagem para escolher uma nova data.
```

Sem rodapé e sem botões.

**Exemplos que a Meta pede**

- {{1}} = Maria Aparecida
- {{2}} = terça, 22/09, às 14:30
- {{3}} = imprevisto da agenda médica

Cancelamento costuma acontecer com dias de antecedência, quando o paciente já
não escreve há tempo. Sem este modelo, o sistema sabe que a consulta caiu, sabe
o telefone, e mesmo assim não consegue avisar: a pessoa descobre ao chegar.

---

## 5. retomar_atendimento

Nome: `retomar_atendimento`
Categoria: Utilidade
Idioma: Português (BR)

**Corpo**

```
Olá, {{1}}. Aqui é o consultório da Dra. Patrícia Zerbini, sobre o seu atendimento em andamento. Para darmos continuidade, é só responder esta mensagem.
```

Sem rodapé e sem botões.

A primeira versão ("Podemos continuar nossa conversa por aqui?") foi barrada
na hora do envio: a Meta disse que, como Utilidade, seria recusada, porque o
texto não citava um atendimento existente. Citar o atendimento em andamento
resolveu.

**Exemplo que a Meta pede**

- {{1}} = Maria Aparecida

Serve para reabrir a conversa depois de 24 horas em silêncio. Ele não trata do
assunto: quando o paciente responde, a janela de 24 horas volta a contar e a
equipe escreve o que precisar.

---

## 6. aviso_pedido_consulta

Nome: `aviso_pedido_consulta`
Categoria: Utilidade
Idioma: Português (BR)

Vai para o WhatsApp pessoal da Dra. Patrícia, não para paciente. Sai quando
alguém pede consulta ou visita pelo robô, a qualquer hora. Com ele, a Dra.
responde o paciente pelo próprio celular: o que ela escrever em cima do aviso
o sistema mostra para ela confirmar e depois manda ao paciente pelo número do
consultório.

**Corpo**

```
📅 Novo pedido de consulta na Central de Cuidado.

{{1}} escreveu às {{2}}:
"{{3}}"

Para responder, escreva a mensagem em cima deste aviso: eu mostro antes de enviar e repasso ao paciente como mensagem sua. Ou toque num botão.
```

Sem rodapé.

**Botões** (resposta rápida, nesta ordem)

```
Eu respondo
Mandar os valores
```

- **Eu respondo**: o paciente recebe "A Dra. Patrícia viu o seu pedido e vai falar com você por aqui."
- **Mandar os valores**: o paciente recebe a resposta pronta de valor cadastrada em Preferências (assunto com "valor"). Se ela não existir ou ainda tiver "___", nada sai e a Dra. é avisada.

**Exemplos que a Meta pede**

- {{1}} = Maria Aparecida
- {{2}} = 14:32
- {{3}} = Primeira consulta no consultório, a partir da próxima semana, só à tarde.

---

## 7. aviso_pedido_consulta_simples

Nome: `aviso_pedido_consulta_simples`
Categoria: Utilidade
Idioma: Português (BR)

O mesmo aviso sem botões. Serve de reserva: enquanto o modelo 6 estiver em
análise, ou se a Meta recusar os botões, o sistema manda este e o aviso chega
do mesmo jeito. Foi o que salvou o sistema do Dr. Marcello em 17/10/2026,
quando o modelo com botões ficou dias em análise.

**Corpo**

```
📅 Novo pedido de consulta na Central de Cuidado.

{{1}} escreveu às {{2}}:
"{{3}}"

Para responder, escreva a mensagem em cima deste aviso: eu mostro antes de enviar e repasso ao paciente como mensagem sua.
```

Sem rodapé e sem botões. Mesmos exemplos do modelo 6.

**Antes de submeter os dois**

- **Período de validade da mensagem**: nos dois, marque "Definir período de
  validade personalizado" e escolha **12 horas**. Com o celular dela desligado,
  o aviso espera até 12 horas em vez de sumir calado (lição do sistema do
  Dr. Marcello, 17/10/2026). É configuração do modelo na Meta, não do código.
- Os botões do modelo 6 são de resposta rápida, sem texto fixo de retorno: o
  sistema manda em cada envio um código que diz de qual pedido é o aviso.
- O celular da Dra. Patrícia fica salvo no sistema (Preferências, cartão
  "Aviso no WhatsApp da Dra."), não no código. O primeiro número da lista é o
  dela; os outros respondem como equipe.
- O {{3}} sai sem CPF, e-mail e telefone, e sem quebra de linha (a Meta
  recusa o envio inteiro quando o parâmetro tem quebra de linha).
- Cada aviso é uma mensagem de Utilidade cobrada pela Meta, como o lembrete.

---

## 8. aviso_duvida_paciente

Nome: `aviso_duvida_paciente`
Categoria: Utilidade
Idioma: Português (BR)

Vai para os mesmos celulares dos modelos 6 e 7, não para paciente. Sai quando
uma dúvida ou urgência precisa de gente: nem o robô nem a IA resolveram. A
resposta escrita em cima do aviso volta ao paciente pelo número do consultório,
depois de confirmar.

**Corpo**

```
💬 Dúvida de paciente na Central de Cuidado, que o atendimento automático não resolveu.

{{1}} escreveu às {{2}}:
"{{3}}"

Para responder, escreva a mensagem em cima deste aviso: eu mostro antes de enviar e repasso ao paciente como mensagem sua.
```

Sem rodapé e sem botões.

**Exemplos que a Meta pede**

- {{1}} = Maria Aparecida
- {{2}} = 14:32
- {{3}} = Pergunta se pode levar os exames antigos na consulta.

**Período de validade**: também **12 horas**, como nos modelos 6 e 7.

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

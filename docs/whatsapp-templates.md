# Templates de WhatsApp (Cloud API oficial)

Referência dos **modelos de mensagem** usados nas notificações de status de pedido.
Criar todos no **WhatsApp Manager → Modelos de mensagem** (ou via API de Message Templates).

- **Categoria:** `Utilidade` (Utility) — obrigatório para ter o preço baixo. Nunca `Marketing`.
- **Idioma:** Português (BR) — código `pt_BR`. (O **nome** do template é em inglês; o **conteúdo**
  é em português.)
- Número **central da LogiFlow** na fase 1 → por isso o **nome da loja** é sempre uma variável,
  para o cliente reconhecer de quem é a mensagem.
- Link de rastreio via **botão de URL dinâmico** (o Meta aprova mais fácil e o corpo fica limpo).

> Regras do Meta respeitadas:
> - Nome do template só aceita **minúsculas, números e `_`** (sem acento) → nomes em inglês.
> - Variáveis numeradas `{{1}} {{2}}…`.
> - **Nenhuma variável no início nem no fim do corpo** — sempre há texto antes da primeira e
>   depois da última (não vale terminar em `{{n}}.`; precisa de uma palavra depois).
> - O botão de URL tem numeração **própria** (o id do pedido é `{{1}}` dentro do botão).

`SEU_DOMINIO` = domínio de rastreio (o `TRACKING_BASE_URL` do backend, ex.
`logiflow-app.quisbert.com.br`).

---

## 1. `order_preparing`
**Corpo**
```
Olá, {{1}}! 🛒 Seu pedido na {{2}} foi registrado e já está sendo preparado. Endereço de entrega: {{3}}. Avisaremos assim que sair para entrega.
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` endereço
- Exemplos: `Maria` · `Pizzaria do Zé` · `Rua das Flores, 123 - Centro`
- Botão: nenhum

## 2. `order_assigned`
**Corpo**
```
Olá, {{1}}! 📦 Seu pedido na {{2}} foi atribuído ao entregador {{3}} e logo sai para entrega. Acompanhe pelo botão abaixo.
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` entregador
- Exemplos: `Maria` · `Pizzaria do Zé` · `João`
- Botão (URL dinâmico): `Acompanhar entrega` → `https://SEU_DOMINIO/rastreio/{{1}}` · ex.: `a1b2c3d4`

## 3. `order_on_route`
**Corpo**
```
Olá, {{1}}! 🚴 O entregador da {{2}} retirou seu pedido e já está a caminho. Responsável pela entrega: {{3}}. Acompanhe em tempo real pelo botão abaixo.
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` entregador
- Exemplos: `Maria` · `Pizzaria do Zé` · `João`
- Botão (URL dinâmico): `Acompanhar entrega` → `https://SEU_DOMINIO/rastreio/{{1}}` · ex.: `a1b2c3d4`

## 4. `order_out_for_delivery`  *(com código de confirmação)*
**Corpo**
```
Olá, {{1}}! 🏃 Seu pedido na {{2}} é a próxima parada! Entregador: {{3}}. Informe o código de confirmação {{4}} ao receber. Acompanhe pelo botão abaixo.
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` entregador · `{{4}}` código
- Exemplos: `Maria` · `Pizzaria do Zé` · `João` · `4821`
- Botão (URL dinâmico): `Acompanhar entrega` → `https://SEU_DOMINIO/rastreio/{{1}}` · ex.: `a1b2c3d4`

## 5. `order_arriving`  *(com código de confirmação)*
**Corpo**
```
Olá, {{1}}! 📍 O entregador da {{2}} está chegando, já está bem pertinho de você! Prepare-se para receber e informe o código {{3}} na entrega. Até já!
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` código
- Exemplos: `Maria` · `Pizzaria do Zé` · `4821`
- Botão: nenhum

## 6. `order_delivered`
**Corpo**
```
Olá, {{1}}! ✅ Seu pedido na {{2}} foi entregue com sucesso no endereço {{3}}. Obrigado pela preferência!
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` endereço
- Exemplos: `Maria` · `Pizzaria do Zé` · `Rua das Flores, 123 - Centro`
- Botão: nenhum

## 7. `order_cancelled`
**Corpo**
```
Olá, {{1}}! ❌ Infelizmente seu pedido na {{2}} foi cancelado. Em caso de dúvidas, entre em contato com a loja.
```
- `{{1}}` cliente · `{{2}}` loja
- Exemplos: `Maria` · `Pizzaria do Zé`
- Botão: nenhum

## 8. `order_address_updated`
**Corpo**
```
Olá, {{1}}! 📍 O endereço de entrega do seu pedido na {{2}} foi atualizado para {{3}}. Acompanhe pelo botão abaixo.
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` novo endereço
- Exemplos: `Maria` · `Pizzaria do Zé` · `Av. Brasil, 900 - Jardim`
- Botão (URL dinâmico): `Acompanhar entrega` → `https://SEU_DOMINIO/rastreio/{{1}}` · ex.: `a1b2c3d4`

---

## Mapa status → template

Definido no código em `buildStatusTemplate` (`backend/src/server.ts`). A ordem dos parâmetros
abaixo é a que o backend envia ao Meta (componente `body`, mais o `button` de URL quando existe).

| statusEvent        | Template                        | Params do corpo (em ordem)          | Botão (id) |
|--------------------|---------------------------------|-------------------------------------|------------|
| `PREPARING`        | `order_preparing`               | cliente, loja, endereço             | —          |
| `ASSIGNED`         | `order_assigned`                | cliente, loja, entregador           | orderId    |
| `ON_ROUTE`         | `order_on_route`                | cliente, loja, entregador           | orderId    |
| `OUT_FOR_DELIVERY` | `order_out_for_delivery`        | cliente, loja, entregador, código   | orderId    |
| `ARRIVING`         | `order_arriving`                | cliente, loja, código               | —          |
| `DELIVERED`        | `order_delivered`               | cliente, loja, endereço             | —          |
| `CANCELLED`        | `order_cancelled`               | cliente, loja                       | —          |
| `ADDRESS_CHANGED`  | `order_address_updated`         | cliente, loja, novo endereço        | orderId    |

## Variantes sem código (opcional)

Se uma loja desligar o código de entrega (`require_delivery_code = false`), os templates 4 e 5
não podem ser usados (não dá para enviar variável vazia). Nesse caso, criar as variantes abaixo.
O `buildStatusTemplate` já seleciona a variante certa conforme `requireDeliveryCode`.

### `order_out_for_delivery_no_code`
```
Olá, {{1}}! 🏃 Seu pedido na {{2}} é a próxima parada! Entregador: {{3}}. Acompanhe pelo botão abaixo.
```
- `{{1}}` cliente · `{{2}}` loja · `{{3}}` entregador
- Botão (URL dinâmico): `Acompanhar entrega` → `https://SEU_DOMINIO/rastreio/{{1}}`

### `order_arriving_no_code`
```
Olá, {{1}}! 📍 O entregador da {{2}} está chegando, já está bem pertinho de você! Prepare-se para receber. Até já!
```
- `{{1}}` cliente · `{{2}}` loja
- Botão: nenhum

## Pré-requisitos operacionais na Meta

1. App na Meta (tipo Business) + Meta Business verificado.
2. WABA + número central + **token permanente de System User**.
3. Aprovar os templates acima **antes** de trocar o provider em produção (aprovação leva de
   minutos a ~1 dia).
4. Configurar o webhook (`/webhooks/whatsapp`) com o `verify token` e assinar os eventos
   `messages`.

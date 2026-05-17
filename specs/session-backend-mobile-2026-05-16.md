# LogiFlow — Sessão de Desenvolvimento 2026-05-16

Resumo de tudo que foi implementado e discutido nesta sessão (que continua uma sessão anterior comprimida). Cobre backend, frontend web e app mobile.

---

## 1. Correções de infraestrutura

### WebSocket hub — campo `alive`
- **Problema:** `wsHub.register()` exigia o campo `alive` explicitamente, causando erro de TypeScript em `app.ts`.
- **Solução:** `register` passou a aceitar `Omit<WsClient, 'alive'>` e construir o objeto internamente, incluindo o registro de `pong` e `close`.

### Heartbeat de WebSocket
- Adicionado `startHeartbeat()` em `shared/infra/websocket.ts`, chamado em `server.ts`.
- Intervalo de 30 s: faz `ping`, e se o cliente não responder com `pong` antes do próximo ciclo, termina a conexão.

### Guarda JWT_SECRET em produção
- `server.ts` falha com `process.exit(1)` se `NODE_ENV === 'production'` e `JWT_SECRET` não estiver definido.

### CORS após upgrade do Fastify
- Upgrade do Fastify 4.x → 5.x (junto com todos os plugins `@fastify/*`).
- `@fastify/cors` v11 mudou o comportamento de `origin: true`; corrigido com callback que reflete o `Origin` via `cb(null, true)`, rejeitando apenas se `FRONTEND_URL` estiver definido e o origin não estiver na lista.

---

## 2. Segurança

### Rate limit em `/auth/*`
- `@fastify/rate-limit` v10 registrado com escopo no plugin de autenticação.
- Limite: 10 requisições por minuto; resposta em português: *"Muitas tentativas. Aguarde 1 minuto e tente novamente."*

### Guarda de foto no app mobile
- `imageQuality` reduzido de 70 → 60 antes do upload.
- Arquivo > 10 MB é rejeitado antes do envio com mensagem de erro ao usuário.

---

## 3. Rastreamento de localização

### Não gravar localização de entregador OFFLINE
- `pg-tracking-repo.ts`: antes de gravar em `location_history`, consulta o status do entregador; se `OFFLINE`, retorna `false` sem persistir.

---

## 4. Batch-assign — atomicidade e ordem de seleção

### Transação no claim de pedidos
- `POST /deliverer/orders/claim` (painel web) passou a usar `db.transaction(async (client) => {...})`.
- Qualquer pedido inválido durante o batch aborta toda a transação — sem atribuições parciais silenciosas.

### Ordem de seleção no mapa (frontend web)
- `batchSelected` mudou de `Set<string>` → `string[]`, preservando a ordem de clique.
- Marcadores Leaflet dos pedidos selecionados exibem um badge circular numerado (DivIcon) em vez do pin padrão.
- `selectionOrder` adicionado à interface `MapDestination` em `LiveMap.tsx`.
- `onReconnect` hook no WebSocket: ao reconectar, dispara `mutate()` para refrescar os dados da página de pedidos.

### Ordem de seleção no mapa (app mobile)
- `_selected` mudou de `Set<String>` → `List<String>` em `order_selection_screen.dart`.
- Pin no mapa exibe o número de seleção (1, 2, 3…) ao invés do ícone de localização.
- Checkbox na lista também exibe o número ao invés do checkmark.
- `_claimPreparing` envia `_selected` diretamente (já ordenado), com filtro de validade contra `prepList`.

---

## 5. Módulo de Metas (`goals`)

### Backend
- Migration `005_goals.sql`: tabela `deliverer_goals` com constraint `UNIQUE (store_id, deliverer_id, type, period)`.
- Tipos de meta: `deliveries`, `avg_rating`, `cancellation_rate`, `avg_delivery_time`.
- Períodos: `daily`, `weekly`, `monthly`.
- `GET /goals/deliverers`: lista entregadores + metas + progresso calculado on-the-fly via SQL com `date_trunc`.
- `PUT /goals/deliverers/:delivererId`: upsert de meta (scope `goals:manage`).
- `DELETE /goals/:goalId`: remove meta (scope `goals:manage`).

### Scopes de acesso
- Adicionados `goals:view` e `goals:manage` em `shared/scopes.ts`.
- ASSISTANT recebe `goals:view` por padrão; OWNER/MANAGER recebem ambos.
- Super-admin consegue atribuir os novos scopes via painel.

### Frontend web
- Página `/goals` com lista de entregadores, barras de progresso coloridas (verde ≥ 100%, azul ≥ 60%, amarelo ≥ 30%, vermelho < 30%).
- Metas de "menor é melhor" (`cancellation_rate`, `avg_delivery_time`) têm lógica invertida.
- Modal para adicionar/editar metas por entregador.
- Item "Metas" adicionado ao sidebar com ícone `Target` (Lucide), protegido por `goals:view`.

---

## 6. Reserva de pedidos em tempo real (race condition no mobile)

### Problema
Dois entregadores podiam selecionar os mesmos pedidos simultaneamente porque o mapa não era atualizado em tempo real. Ao tentar criar a rota, um deles perdia os pedidos silenciosamente.

### Solução implementada: soft lock no banco + WebSocket

#### Migration `006_order_reservations.sql`
```sql
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS reserved_by  UUID REFERENCES deliverers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reserved_at  TIMESTAMPTZ;
```

#### Backend
| Endpoint | Comportamento |
|---|---|
| `POST /deliverer/orders/:id/reserve` | Reserva o pedido com TTL de 2 min. Retorna 409 se já reservado por outro entregador dentro do TTL. |
| `DELETE /deliverer/orders/:id/reserve` | Libera a reserva do entregador autenticado. |
| `GET /deliverer/orders/preparing` | Exclui pedidos reservados por *outros* entregadores com TTL válido (`reserved_at < now() - interval '2 minutes'` passa). |
| `POST /deliverer/orders/claim` | Ao concluir, limpa `reserved_by`/`reserved_at` dos pedidos claimados. |

- `wsHub.broadcastOrderReservation(storeId, orderId, delivererId | null)`: emite `order_reserved` ou `order_unreserved` para todos os clientes da loja.
- `wsHub.register` aceita `onClose` callback; quando um entregador desconecta, todas as suas reservas são liberadas automaticamente e um broadcast `order_unreserved` é enviado para cada uma.

#### Mobile (`location_service.dart`)
- `messageStream` (broadcast stream) exposta no `LocationService`, reutilizando o WebSocket de localização já existente.
- Mensagens recebidas pelo WS são decodificadas e emitidas no stream.

#### Mobile (`order_selection_screen.dart`)
- `_hiddenByOthers: Set<String>` — IDs de pedidos reservados por outros, atualizado em tempo real via WS.
- `_toggleSelect(orderId)` — ao selecionar, faz `POST reserve` antes de adicionar à lista; ao deselecionar, faz `DELETE reserve` de forma fire-and-forget.
- `initState` assina `locationService.messageStream` e atualiza `_hiddenByOthers` ao receber `order_reserved`/`order_unreserved`.
- `dispose` libera todas as reservas pendentes ao sair da tela.
- Mapa e lista filtram pedidos presentes em `_hiddenByOthers` — somem em tempo real do mapa dos outros.

---

## 7. Correções pontuais de API

### `api.delete` falhando em respostas 204
- `src/lib/api.ts`: adicionado `if (res.status === 204) return null as T` antes de `res.json()`, evitando erro de parse em body vazio.

---

## Migrations a rodar

```bash
# backend/
npm run migrate
```

Migrations aplicadas nesta sessão:
- `005_goals.sql`
- `006_order_reservations.sql`

---

## Pendências conhecidas

| Item | Descrição |
|---|---|
| Cenário 7 | Upload de foto pode falhar silenciosamente — pedido marcado DELIVERED sem prova. Precisar de validação/retry. |
| Cenário 8 | Tabela `location_history` cresce indefinidamente. Avaliar TTL via cron job ou migração para DynamoDB. |
| CORS no Render | Confirmar que `FRONTEND_URL=https://logiflow-beige.vercel.app` está configurado nas env vars do Render. |

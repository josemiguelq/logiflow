# Avaliação de escalabilidade — crescer para ~50 lojas

## Contexto

A meta é suportar **dezenas de lojas (~50)** mantendo o setup atual: **1 serviço na Render + 1 Postgres + 1 Redis**, com mudanças apenas de **código/config** (sem rearquitetura). As dores a atacar são **estabilidade (quedas)** e **lentidão** conforme os dados crescem.

Implicação de projeto: o objetivo **não** é escalar horizontalmente — é fazer a **instância única** aguentar 50 lojas com folga. Por isso, WebSocket em memória e worker no mesmo processo **não são problema em si** (são, sim, um teto se um dia precisar de 2+ instâncias). O foco é: não derrubar a instância e não deixar as queries lentas.

Cada ponto traz a **evidência no código**, o **risco** e **o que avaliar/fazer** dentro da restrição (código/config, instância única).

---

## P0 — Estabilidade (evitar quedas e indisponibilidade)

### 1. Hibernação + tamanho da instância (Render)
- **Evidência:** host de produção com `-hibernate-` (visto nos logs); o serviço dorme por inatividade → cold start.
- **Risco:** para 50 lojas pagantes, hibernar = "fora do ar" intermitente; cold start derruba o tempo real e o polling do painel.
- **Avaliar/fazer (config):** plano **always-on**; dimensionar RAM/CPU para a carga in-process (clients WS + ~50 sockets WhatsApp + caches). Sem isso, os outros itens não importam.

### 2. Esgotamento de conexões do Postgres
- **Evidência:** pool `max: 20` por instância (`src/shared/db/client.ts`); `console.log('dbUrl', dbUrl)` **vaza a senha do banco no log**. Done 
- **Risco:** Postgres tem teto de conexões; runaway queries seguram conexões e o app passa a dar timeout/queda. Senha em log é exposição.
- **Avaliar/fazer (código/config):** conferir `max_connections` do Postgres vs pool (deixar folga); adicionar `statement_timeout` para matar query travada; **remover o `console.log` da URL**; garantir `release()` em todo `db.connect()`/`transaction` (hoje o `transaction` libera no `finally` — ok). 

### 3. WhatsApp (Baileys) — sessões no processo da API
- **Evidência:** `const sockets = new Map<string, SocketInstance>()` em `baileys-provider.ts:12` — uma conexão WA persistente **por loja**, no mesmo processo da API/WS/worker.
- **Risco:** **maior risco in-process aos 50**. Tempestade de reconexão ou um socket com defeito trava o event loop / estoura memória → **OOM derruba todas as lojas** de uma vez.
- **Avaliar/fazer:** orçar memória por sessão; isolar falha (desabilitar/expirar sessões mortas em vez de reconectar em loop); medir uso real com N sessões. *(Externalizar o WhatsApp num serviço próprio é a solução definitiva, mas é mudança de infra — anotar como saída se a memória/instabilidade não couber no plano único.)*

### 4. Ausência de rate limiting
- **Evidência:** `src/app.ts` registra só `cors`, `jwt`, `websocket` — sem `rate-limit`.
- **Risco:** um app/painel com polling agressivo (ex.: `/orders/pickup-alert`) × 50 lojas × vários operadores satura a instância única; nada protege contra abuso/bug.
- **Avaliar/fazer (código):** `@fastify/rate-limit` (por IP/token); revisar intervalos de polling do front (subir onde for curto). Barato e protege estabilidade.

### 5. Tudo num processo só (API + WS + worker + scan + WhatsApp)
- **Evidência:** `src/server.ts` sobe `createNotificationWorker`, `setInterval(runDelayScan, 60_000)` e `startHeartbeat` junto do `app.listen`.
- **Risco:** trabalho pesado (scan, analytics, WA) **bloqueia o atendimento de requests** → timeouts.
- **Avaliar/fazer:** manter os jobs leves e não-bloqueantes (o dedup do scan é em memória — `sentAlerts`, aceitável). Se a instabilidade persistir, mover **só o worker** para um Render *background worker* (mesmo Postgres/Redis) é a mudança mínima de infra que resolve — registrar como opção.

---

## P1 — Lentidão (conforme os dados crescem)

### 6. `location_history` sem retenção (e alto volume de escrita)
- **Evidência:** ingestão a cada ~15s por entregador (`tracking/interface/routes.ts` + `pg-tracking-repo.ts`); tabela sem TTL/partição (já foi necessário um `DELETE` manual).
- **Risco:** ~1M+ linhas/dia que nunca são podadas → tracking lento, bloat, backup gigante. **Bate nas duas dores.**
- **Avaliar/fazer (código):** job de **retenção** (ex.: manter 7–14 dias) reusando o padrão de `setInterval`/worker já existente; confirmar que `idx_location_deliverer_time(deliverer_id, recorded_at DESC)` cobre as leituras (cobre). Maior ganho de perf com menor esforço.

### 7. Invalidação de cache com `KEYS` (bloqueia o Redis)
- **Evidência:** `redis.keys('orders:store:${storeId}:*')` em `src/modules/orders/interface/routes.ts:45`, chamado a cada mutação de pedido.
- **Risco:** `KEYS` é O(N) sobre todo o keyspace e **bloqueia** o Redis; × 50 lojas vira pico de latência em cada criação/atribuição/cancelamento.
- **Avaliar/fazer (código):** trocar por estratégia sem varredura — **chave versionada** (um inteiro `orders:ver:{storeId}` que entra na chave de cache; ao mutar, `INCR` na versão e as chaves antigas expiram por TTL) ou manter um `Set` de chaves por loja e dar `DEL`. Remove a chamada bloqueante.

### 8. Queries quentes de painel/analytics varrendo dados por loja
- **Evidência:** `by-status` conta **todos** os pedidos da loja com `GROUP BY` sem recorte de tempo; `idle-time` varre todo o `deliverer_status_history`; board/all-orders.
- **Risco:** ficam lentas conforme o histórico por loja cresce.
- **Avaliar/fazer (código):** garantir índices compostos para os filtros reais (`orders(store_id,status)` existe; conferir `(store_id, created_at)` e `(store_id, status, created_at)`); recorte de tempo/paginação onde faltar; para os números do dashboard, considerar contagem cacheada com TTL curto.

### 9. Loops de query por linha em caminhos de escrita
- **Evidência:** `batch-assign` e add-to-route fazem 1 query por pedido; `signOrdersProof` resolve URL de imagem por pedido.
- **Risco:** baixo no volume atual; pode pesar na loja mais movimentada.
- **Avaliar/fazer:** medir antes; otimizar só se aparecer. Prioridade menor.

---

## P2 — Higiene, segurança de tenant e visibilidade

### 10. Isolamento de tenant só na aplicação (sem RLS)
- **Evidência:** todo query carrega `store_id`; não há Row-Level Security no Postgres.
- **Risco:** aos 50, gerenciável, mas **um** filtro `store_id` esquecido = vazamento entre lojas.
- **Avaliar/fazer:** auditoria/lint das queries sem `store_id`, ou um guard na camada de repositório. Baixo esforço, alto valor de segurança.

### 11. Observabilidade (pra saber onde dói primeiro)
- **Risco:** a dor é estabilidade + lentidão — sem métricas, prioriza-se no escuro.
- **Avaliar/fazer (config):** ativar `log_min_duration_statement` (slow queries), e expor métricas básicas: conexões do pool em uso, lag do event loop, memória, latência do Redis. Barato e direciona todo o resto.

### 12. Backups e migrations
- **Avaliar/fazer:** confirmar backup automático do Postgres; manter migrations aditivas/online (hoje são) para deploy sem downtime com tenants ativos.

---

## Sequência recomendada (primeiros passos)

1. **Observabilidade primeiro** (#11) + remover `console.log` da URL (#2) — barato, confirma os maiores ofensores.
2. **Estabilidade:** plano always-on/sizing (#1), rate limit (#4), `statement_timeout` (#2), checar memória das sessões WA (#3).
3. **Lentidão:** retenção de `location_history` (#6) e fim do `KEYS` (#7) — maior impacto/esforço.
4. **Depois:** índices/recortes de analytics (#8), auditoria de `store_id` (#10).

**Sugestão de 1º PR:** retenção de `location_history` (#6) + troca do `KEYS` por chave versionada (#7) + remoção do log da senha + `statement_timeout` — tudo código/config, ataca direto as duas dores, sem tocar infra.

## Como validar as prioridades
- Ligar slow-query log e medir as queries de board/analytics da maior loja sob dados reais; ver `pg_stat_activity` para conexões presas.
- Medir memória do processo com as ~N sessões Baileys ativas (projeção linear até 50).
- Carga sintética no `/orders/pickup-alert` e em criação/cancelamento de pedidos para observar latência do Redis com/sem a mudança do `KEYS`.
- Após retenção, comparar tempo das telas de tracking antes/depois e o tamanho da tabela.

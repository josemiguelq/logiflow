# Isolamento de lojas no `username` (auth)

> Análise de tenant isolation: o que acontece quando dois usuários de lojas
> diferentes têm o mesmo `username`. Documento de referência — **nada foi alterado
> no código** ainda.

## TL;DR

Hoje o `username` é **global** (único em todo o sistema), não escopado por loja.
Logo, **não é possível** ter dois iguais entre lojas — a segunda loja que tentar
cadastrar recebe erro de unicidade, o que **vaza** que o nome existe em outra loja
e cria disputa por nomes comuns. Para isolamento real é preciso `UNIQUE(store_id,
username)` + ajustar o login do entregador para identificar a loja.

## Como está hoje

### Entregadores (`deliverers`)
- Constraint: `username TEXT NOT NULL UNIQUE` — **único global**
  (`backend/src/shared/db/migrations/001_schema.sql:106`).
- Login: **só por `username`** — `loginDeliverer` → `delivererRepo.findByUsername(username)`,
  sem nenhuma referência à loja
  (`backend/src/modules/auth/application/use-cases/login-deliverer.ts`).

### Usuários da loja (`store_users`)
- `email TEXT NOT NULL UNIQUE` (global) e
  `CREATE UNIQUE INDEX idx_store_users_username ON store_users(username)` — `username`
  **único global** (`backend/src/shared/db/migrations/001_schema.sql:89,97`).
- Login: **por `email`** — `loginStoreUser` → `storeUserRepo.findByEmail(email)`
  (`backend/src/modules/auth/application/use-cases/login-store-user.ts`).

## O que acontece com username repetido entre lojas

Na prática **não dá pra ter dois iguais** — a constraint global impede. As
consequências são exatamente o problema de isolamento:

1. **Vazamento entre lojas no cadastro**: se a Loja B tenta criar um entregador/usuário
   com um `username` já usado pela Loja A, o insert falha com violação de unicidade
   ("username já existe"). Isso **revela à Loja B** que o nome existe em outra loja.
2. **Disputa de namespace global**: nomes comuns (`joao`, `entregador1`, `admin`) são
   "first-come" entre **todas** as lojas; a Loja B fica impedida de usar um nome só
   porque outra loja pegou primeiro.
3. **Usuários da loja**: como o login é por `email`, o `username` só pesa no cadastro —
   mas o índice único global ainda vaza/limita.

## Por que não está escopado por loja

O login do **entregador é por `username` puro**. Se o `username` fosse único só por
loja (`UNIQUE(store_id, username)`), poderia haver dois `joao` em lojas diferentes →
`findByUsername('joao')` ficaria **ambíguo** e o login não saberia qual loja. Por isso
hoje o sistema depende da unicidade global.

## Correção recomendada (isolamento real)

1. Trocar as constraints para **`UNIQUE(store_id, username)`** em `deliverers` e
   `store_users`; **remover** o índice global `idx_store_users_username`.
   (Migration nova; cuidado com dados existentes que possam colidir.)
2. Ajustar o **login do entregador** para identificar a loja, ex.: informar um
   **slug/código curto da loja** + `username` + senha → trocar `findByUsername` por
   `findByStoreAndUsername(storeId, username)`.
3. Tornar a **mensagem de erro de cadastro genérica** (não confirmar a existência do
   username) para não vazar entre tenants.

> Observação: o login do **usuário da loja** continua por `email` (naturalmente
> global), então não exige mudança de fluxo — só a decisão de escopar/remover o índice
> de `username`.

## Arquivos relevantes
- `backend/src/shared/db/migrations/001_schema.sql` (constraints `deliverers`/`store_users`)
- `backend/src/modules/auth/application/use-cases/login-deliverer.ts`
- `backend/src/modules/auth/application/use-cases/login-store-user.ts`
- Repositórios de auth (`findByUsername`, `findByEmail`) em `backend/src/modules/auth/`

# Integração — API Rein Sistemas

Documento de referência para integração da LogiFlow com a **API de Integração Rein
Sistemas** (`https://api.rein.net.br`). Foco inicial no endpoint de pedidos
(`GET /api/v1/pedido` — `PedidoController_findAll`).

> Investigado em 2026-07-10 a partir do spec OpenAPI e de curls reais contra a base
> de teste `teste05`. A LogiFlow ainda não possui código de integração com a Rein.

---

## Visão geral

- **API**: "API de Integração Rein Sistemas" v1.0 (NestJS/Express + Swagger).
- **Base URL**: `https://api.rein.net.br` — todos os recursos sob `/api/v1/`.
- **Spec OpenAPI 3.0**: embutido em `https://api.rein.net.br/swagger-ui-init.js`
  (objeto `swaggerDoc`). Não há `/api-json` público — o Swagger UI está na raiz `/`.

---

## Autenticação — fluxo de 2 passos

### Passo 1 — Gerar token: `POST /api/v1/token`

Body JSON:

```json
{
  "service": "/api/v1/pedido",
  "clientSecret": "<clientSecret>",
  "database": "<base>"
}
```

Resposta:

```json
{ "status": 200, "data": { "token": "<64-hex>", "timestamp": "<epoch>" } }
```

- **Rate limit: 1 requisição a cada 2 minutos.**
- Endpoint auxiliar de teste ("Testar Token"). O `token` é um SHA-256 de 64 caracteres
  (fórmula exata não reproduzida — combina `service`/`clientSecret`/`timestamp`/`database`
  de forma não-óbvia).
- Em produção o app deve **gerar o token localmente** conforme a doc "Gerar Token" da
  Rein, para não esbarrar no rate limit de 1/2min.
- O `service` informado ao gerar o token deve corresponder ao endpoint que será chamado.

### Passo 2 — Chamar o recurso (headers obrigatórios)

Toda requisição a um recurso exige 4 headers:

| Header      | Descrição                                                             |
|-------------|-----------------------------------------------------------------------|
| `Token`     | Token gerado no passo 1                                                |
| `Database`  | Nome da base de dados do cliente                                       |
| `Timestamp` | O `timestamp` retornado no passo 1 (janela de validade máx. **15 min**) |
| `ClientId`  | Identificação da chave de acesso do cliente                            |

Fluxo de validação no servidor: busca a config do `ClientId` na base → recupera o
`clientSecret` → recalcula/valida o `Token` → valida a janela do `Timestamp`.

---

## Endpoints

Todos sob `/api/v1/`. Padrão CRUD: `GET` (lista paginada), `GET /{id}` (detalhe),
`PUT` (cadastrar), `POST /{id}` (atualizar).

`token` (POST), `produto`, `pessoa`, `tabela-preco`, `condicao-pagamento`,
`canal-venda`, `tipo-cadastro`, `usuario`, `variacao`, `categoria`, `marca`,
`unidade`, `figura-fiscal` (NCM), `pedido`.

- Endpoints de **listagem**: rate limit **60 req/min**.

---

## Pedido

### `GET /api/v1/pedido` — Listar pedidos (paginado)

Filtros via query string (todos opcionais):

| Parâmetro        | Descrição                                            |
|------------------|------------------------------------------------------|
| `TipoMovimento`  | `1` = Compra, `4` = Venda                            |
| `page`           | Número da página                                     |
| `DataMovInicial` | Data inicial do movimento — formato `aaaa-mm-dd`     |
| `DataMovFinal`   | Data final do movimento — formato `aaaa-mm-dd`       |
| `Finalizado`     | `0` = pendentes, `1` = finalizados                   |
| `CodDestino`     | Código da pessoa no Ctrl-E                           |
| `CpfCnpj`        | Filtra por CPF ou CNPJ                               |
| `CanalVendaId`   | Filtra por canal de venda                            |

### `PUT /api/v1/pedido` — Cadastrar pedido

Payload (schema `Pedido` — todos os campos obrigatórios):

| Campo               | Tipo     | Observação                          |
|---------------------|----------|-------------------------------------|
| `CodOrigem`         | number   |                                     |
| `CodDestino`        | number   |                                     |
| `CodEmpresaServico` | number   |                                     |
| `CodVendedor`       | number   |                                     |
| `CanalVendaId`      | number   |                                     |
| `IndicadorPresenca` | number   |                                     |
| `CodNatureza`       | string   |                                     |
| `UsoMercadoria`     | string   |                                     |
| `Produto`           | array    | itens do pedido (schema `Movimento`) |
| `Pagamento`         | array    | pagamentos (schema `Pagamento`)      |

`Produto[]` (schema `Movimento`, todos obrigatórios):
`IdProduto`, `CodProduto`, `CodTabelaPreco`, `QtdProduto`, `ValorUnitario`.

`Pagamento[]` (todos obrigatórios):
`ParcelaId`, `CodMeioPagamento`, `ValorPagamento`, `DataPagamento`.

### Demais

- `GET /api/v1/pedido/{id}` — visualizar pedido.
- `POST /api/v1/pedido/{id}` — atualizar pedido.

---

## Resultado dos testes reais

Credenciais usadas: ClientId `2be7-ac26-af6d-3fb4`, base `teste05`, usuário `Dev`.

- ✅ **Geração de token funcionou** — `POST /api/v1/token` com o `clientSecret` +
  `teste05` retornou token e timestamp válidos (HTTP 201).
- ❌ **`GET /api/v1/pedido` retornou 401**:

  > `"Falha ao obter configuração da chave de acesso do ClientId 2be7-ac26-af6d-3fb4.`
  > `Verifique se existem chaves de acesso configurado no sistema teste05."`

  - Variações de formato do ClientId testadas (`2be7ac26af6d3fb4` sem hífens,
    `2BE7-AC26-AF6D-3FB4` maiúsculo) → mesmo erro.
  - **Conclusão**: o token/timestamp são aceitos; a falha está na busca da chave de
    acesso. O `ClientId` fornecido **não está registrado/configurado na base `teste05`**
    (ou o ClientId correto é outro). Precisa ser resolvido com a Rein antes de validar
    o consumo real do endpoint.
  - Observação de segurança: passar `ClientId: Dev` resolveu para outra base/tenant
    (`aloexpress`) — não aprofundado por ser dado de terceiros.

---

## Curls executados (reproduzíveis — para enviar ao suporte Rein)

**1) Gerar token — funcionou (HTTP 201):**

```bash
curl -s -X POST "https://api.rein.net.br/api/v1/token" \
  -H "Content-Type: application/json" \
  -d '{"service":"/api/v1/pedido","clientSecret":"<clientSecret>","database":"teste05"}'
```

Resposta:

```json
{"status":200,"data":{"token":"882fa7f2...687fe8","timestamp":"1783706194"}}
```

**2) Listar pedidos — falhou (HTTP 401):**

```bash
curl -s "https://api.rein.net.br/api/v1/pedido?page=1&TipoMovimento=4" \
  -H "Token: 882fa7f2...687fe8" \
  -H "Database: teste05" \
  -H "Timestamp: 1783706194" \
  -H "ClientId: 2be7-ac26-af6d-3fb4"
```

Resposta:

```json
{"status":401,"message":"Falha ao obter configuração da chave de acesso do ClientId 2be7-ac26-af6d-3fb4. Verifique se existem chaves de acesso configurado no sistema teste05.","error":"Unauthorized"}
```

**3) Variações de formato do ClientId** (`2be7ac26af6d3fb4`, `2BE7-AC26-AF6D-3FB4`)
→ todas HTTP 401 com a mesma mensagem.

> **Pergunta para o suporte Rein**: o ClientId `2be7-ac26-af6d-3fb4` está configurado
> como chave de acesso na base `teste05`? Qual o formato exato esperado no header
> `ClientId`?

---

## Verificação futura

Quando o `ClientId` estiver configurado na `teste05`, reexecutar o fluxo de 2 passos e
confirmar que `GET /api/v1/pedido` retorna **200** com a lista paginada de pedidos
(hoje retorna 401 por configuração da chave de acesso).

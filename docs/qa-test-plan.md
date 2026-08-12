# Plano de Testes — LogiFlow

**Versão:** 1.0  
**Data:** 10/07/2026  
**Ambiente:** Frontend (Next.js/Vercel) + Backend (Fastify/EasyPanel) + Mobile (Flutter)

---

## Índice

1. [Cadastro da Loja](#1-cadastro-da-loja)
2. [Login do Lojista](#2-login-do-lojista)
3. [Login do Entregador](#3-login-do-entregador)
4. [Configurações da Loja](#4-configurações-da-loja)
5. [Gerenciamento de Equipe (Usuários)](#5-gerenciamento-de-equipe-usuários)
6. [Gerenciamento de Entregadores](#6-gerenciamento-de-entregadores)
7. [Gerenciamento de Clientes](#7-gerenciamento-de-clientes)
8. [Criação de Pedidos](#8-criação-de-pedidos)
9. [Atribuição de Pedidos e Rotas](#9-atribuição-de-pedidos-e-rotas)
10. [Fluxo do Entregador (Mobile)](#10-fluxo-do-entregador-mobile)
11. [Rastreamento Público](#11-rastreamento-público)
12. [Chat Operador ↔ Entregador](#12-chat-operador--entregador)
13. [Analytics e Relatórios](#13-analytics-e-relatórios)
14. [WhatsApp](#14-whatsapp)
15. [Gamificação e Metas](#15-gamificação-e-metas)
16. [Garantias](#16-garantias)
17. [Anúncios](#17-anúncios)
18. [Auto-Rotas](#18-auto-rotas)
19. [Sessões e Segurança](#19-sessões-e-segurança)
20. [RBAC e Permissões](#20-rbac-e-permissões)
21. [Super Admin](#21-super-admin)
22. [WebSocket e Tempo Real](#22-websocket-e-tempo-real)
23. [Correlation ID](#23-correlation-id)

---

## 1. Cadastro da Loja

### 1.1 Cadastro com E-mail + Senha

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 1.1.1 | Cadastro com dados válidos | Preencher storeName, ownerName, email, password (6+ chars) → Submit | Loja criada, usuário OWNER criado, redireciona para `/orders` |
| 1.1.2 | E-mail duplicado | Cadastrar com e-mail já existente | Erro 409 "email already in use" |
| 1.1.3 | Senha curta | Password com menos de 6 caracteres | Validação frontend impede submit |
| 1.1.4 | Campos obrigatórios vazios | Deixar storeName, email ou password vazios | Validação frontend impede submit |
| 1.1.5 | storeName curto | StoreName com 1 caractere | Validação backend: min 2 |
| 1.1.6 | Token JWT emitido | Após cadastro bem-sucedido | Token válido no localStorage (`logiflow_token`), sessão criada no Redis |

### 1.2 Cadastro com Google OAuth

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 1.2.1 | Cadastro via Google com conta válida | Selecionar Google SSO → autorizar | Loja criada, vinculada ao Google account |
| 1.2.2 | Google com e-mail já cadastrado | Usar Google com e-mail existente | Erro 409 "email already in use" |
| 1.2.3 | Token Google inválido | Enviar credential inválido | Erro 401 na validação |

### 1.3 Cadastro Multi-Step (Prospect)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 1.3.1 | Step 1 completo | Preencher storeName, cpfCnpj, email, phone → Submit | Prospect criado, retorna ID |
| 1.3.2 | CPF/CNPJ inválido | CPF com menos de 11 dígitos | Erro de validação |
| 1.3.3 | Phone inválido | Phone com menos de 10 dígitos | Erro de validação |
| 1.3.4 | Step 2 — endereço | Informar address, lat, lng | Prospect atualizado |
| 1.3.5 | Convert — password | Informar ownerName + password → convert | Loja + OWNER criados |
| 1.3.6 | Convert — Google | Informar googleCredential → convert | Loja + OWNER criados via Google |
| 1.3.7 | Prospect idempotente | Submeter mesmo email duas vezes | Retorna mesmo prospect (não duplica) |
| 1.3.8 | Prospect já convertido | Tentar converter prospect já convertido | Erro 409 |

### 1.4 Planos

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 1.4.1 | Listar planos ativos | GET `/plans` | Lista de planos ativos retornada |

---

## 2. Login do Lojista

### 2.1 Login com E-mail + Senha

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 2.1.1 | Login válido | Email + password corretos | Token JWT emitido, redireciona para `/orders` |
| 2.1.2 | Senha incorreta | Email correto, password errado | Erro 401 "Invalid credentials" |
| 2.1.3 | E-mail inexistente | Email não cadastrado | Erro 401 "Invalid credentials" (mesma mensagem — não vazar existência) |
| 2.1.4 | Campos vazios | Email ou password vazio | Validação frontend impede submit |
| 2.1.5 | Throttle de login | 5+ tentativas falhas consecutivas | Resposta 429 com tempo de cooldown |
| 2.1.6 | Rate limit global | 11+ requests em 1 minuto | Resposta 429 "Too Many Requests" |

### 2.2 Login com Google

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 2.2.1 | Google login com conta cadastrada | Clicar "Entrar com Google" → autorizar | Token emitido, redireciona para `/orders` |
| 2.2.2 | Google com conta não cadastrada | Google com e-mail não registrado no sistema | Erro 403 "email not registered" |
| 2.2.3 | Token Google expirado/inválido | Credential inválido | Erro 401 |

### 2.3 Logout

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 2.3.1 | Logout limpa sessão | Clicar logout | Token removido do localStorage, sessão revogada no Redis (JTI denylist), redireciona para `/login` |
| 2.3.2 | Request após logout | Tentar acessar `/orders` após logout | Redireciona para `/login` |
| 2.3.3 | Token revogado no backend | Após logout, tentar request com token antigo | Erro 401, `forceLogout()` no frontend |

---

## 3. Login do Entregador

### 3.1 Login v2 (Multi-Store)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 3.1.1 | Login válido | storeCode + username + password corretos | Token emitido (type: deliverer), app abre |
| 3.1.2 | Código de loja inválido | storeCode inexistente | Erro 401 |
| 3.1.3 | Username incorreto | storeCode correto, username errado | Erro 401 |
| 3.1.4 | Senha incorreta | Credenciais corretas exceto password | Erro 401 |
| 3.1.5 | Throttle | 5+ tentativas falhas | 429 com cooldown |
| 3.1.6 | Resolver loja por código | GET `/auth/store/by-code/:code` com código válido | Dados da loja retornados (nome, endereço) |
| 3.1.7 | Código inexistente | GET `/auth/store/by-code/XXXX` | Erro 404 |

### 3.2 Termos de Uso

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 3.2.1 | Ver termos | GET `/deliverer/terms` | Conteúdo + versão + status de aceite |
| 3.2.2 | Aceitar termos | POST `/deliverer/terms/accept` | Aceite registrado com IP, user-agent, versão, timestamp |
| 3.2.3 | Termos já aceitos | Aceitar novamente | Idempotente (não duplica) |

### 3.3 Onboarding

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 3.3.1 | Ver perfil (onboarding flags) | GET `/deliverer/me` | Retorna `needsOnboarding`, `needsSwitchTour` |
| 3.3.2 | Marcar tour como visto | POST `/deliverer/onboarding/switch-tour/seen` | `needsSwitchTour` = false |

---

## 4. Configurações da Loja

### 4.1 Tema e Logo

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 4.1.1 | Ver tema atual | GET `/store/theme` | Cores (primary, secondary, accent) + logoUrl + features |
| 4.1.2 | Atualizar cores | PATCH `/store/theme` com novas cores (#RRGGBB) | Tema atualizado, cache Redis invalidado |
| 4.1.3 | Upload de logo | PATCH `/store/theme` com logoUrl (base64 data URI) | Logo enviada para S3, URL retornada |
| 4.1.4 | Remover logo | PATCH `/store/theme` com logoUrl: null | Logo removida |
| 4.1.5 | Cor inválida | Enviar cor fora do formato #RRGGBB | Erro de validação |
| 4.1.6 | ASSISTANT tenta alterar tema | Login como ASSISTANT → PATCH theme | Erro 403 (OWNER/MANAGER apenas) |

### 4.2 Configurações Operacionais

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 4.2.1 | Ver configurações | GET `/store/settings` | Todas as 20+ configurações retornadas |
| 4.2.2 | Atualizar maxOrdersPerRoute | PATCH com valor 1-20 | Configuração salva |
| 4.2.3 | maxOrdersPerRoute fora do range | PATCH com valor 0 ou 21 | Erro de validação |
| 4.2.4 | Toggle requireDeliveryPhoto | PATCH com boolean | Configuração atualizada |
| 4.2.5 | Configurar delay thresholds | PATCH com delayPrepYellowMin, delayPrepRedMin | Valores salvos (1-600) |
| 4.2.6 | Configurar deliveryProximityMeters | PATCH com valor 10-5000 | Configuração salva |
| 4.2.7 | Configurar arrivalRadiusMeters | PATCH com valor 5-500 | Configuração salva |
| 4.2.8 | Atualizar endereço da loja | PATCH com storeAddress, storeLat, storeLng | Endereço salvo |
| 4.2.9 | ASSISTANT tenta alterar config | Login como ASSISTANT → PATCH settings | Erro 403 (OWNER/MANAGER apenas) |

### 4.3 Billing / Plano

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 4.3.1 | Ver billing | GET `/store/billing` | Status do plano, trial, uso (deliverers + pedidos vs limites) |
| 4.3.2 | Ver features habilitadas | GET `/store/features` | Lista de feature flags |

### 4.4 Senha Própria

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 4.4.1 | Alterar senha com sucesso | currentPassword + newPassword (6+) | Senha alterada, sessão atual mantida |
| 4.4.2 | Senha atual incorreta | currentPassword errado | Erro 400 |
| 4.4.3 | Nova senha curta | newPassword com menos de 6 chars | Validação impede |

---

## 5. Gerenciamento de Equipe (Usuários)

### 5.1 Listar Usuários

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 5.1.1 | OWNER lista usuários | GET `/store/users` | Todos os usuários da loja retornados |
| 5.1.2 | ASSISTANT lista usuários | GET `/store/users` como ASSISTANT | Erro 403 (users:view requer OWNER) |

### 5.2 Criar Usuário

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 5.2.1 | OWNER cria MANAGER | POST com role: MANAGER | Usuário criado |
| 5.2.2 | OWNER cria ASSISTANT | POST com role: ASSISTANT | Usuário criado |
| 5.2.3 | Email duplicado | POST com email já existente | Erro 409 |
| 5.2.4 | Username duplicado | POST com username já existente | Erro 409 |
| 5.2.5 | Senha opcional (Google-only) | POST sem password mas com dados válidos | Usuário criado (Google-only) |
| 5.2.6 | MANAGER tenta criar usuário | Login como MANAGER → POST | Erro 403 (users:create requer OWNER) |
| 5.2.7 | ASSISTANT tenta criar usuário | Login como ASSISTANT → POST | Erro 403 |

### 5.3 Deletar Usuário

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 5.3.1 | OWNER deleta ASSISTANT | DELETE `/store/users/:id` | Usuário removido |
| 5.3.2 | OWNER deleta MANAGER | DELETE `/store/users/:id` | Usuário removido |
| 5.3.3 | MANAGER deleta ASSISTANT | DELETE como MANAGER | Sucesso |
| 5.3.4 | MANAGER tenta deletar MANAGER | DELETE como MANAGER para outro MANAGER | Erro 403 |
| 5.3.5 | Tentar deletar a si mesmo | DELETE com próprio ID | Erro 400 |

### 5.4 Reset de Senha

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 5.4.1 | OWNER reseta senha de ASSISTANT | PATCH `/store/users/:id/password` | Senha alterada, **todas as sessões do alvo revogadas** |
| 5.4.2 | Usuário afetado perde sessão | Após reset, tentar request com token antigo | Erro 401 |
| 5.4.3 | MANAGER reseta senha de ASSISTANT | PATCH como MANAGER | Sucesso |
| 5.4.4 | MANAGER tenta resetar MANAGER | PATCH como MANAGER para outro MANAGER | Erro 403 |

---

## 6. Gerenciamento de Entregadores

### 6.1 CRUD

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.1.1 | Listar entregadores | GET `/deliverers` | Lista de todos os entregadores da loja |
| 6.1.2 | Criar entregador | POST `/deliverers` com name, username, password | Entregador criado, username único por loja |
| 6.1.3 | Username duplicado (mesma loja) | POST com username existente na loja | Erro 409 |
| 6.1.4 | Username com caracteres inválidos | Username fora de `/^[a-z0-9_.]+$/` | Erro de validação |
| 6.1.5 | Username com menos de 3 chars | Username com 2 caracteres | Erro de validação (min 3) |
| 6.1.6 | Senha curta | Password com menos de 6 chars | Erro de validação |
| 6.1.7 | Atualizar entregador | PATCH `/deliverers/:id` com novos dados | Dados atualizados |
| 6.1.8 | Soft-delete | DELETE `/deliverers/:id` | Entregador removido (pedidos preservados) |
| 6.1.9 | ASSISTANT tenta criar entregador | Login como ASSISTANT → POST | Erro 403 (MANAGER+ apenas) |
| 6.1.10 | ASSISTANT tenta atualizar entregador | Login como ASSISTANT → PATCH | Erro 403 |

### 6.2 Ativar / Desativar

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.2.1 | Ativar entregador | PATCH `/deliverers/:id/active` com `active: true` | Entregador ativado, limite do plano verificado |
| 6.2.2 | Desativar entregador | PATCH com `active: false` | Entregador desativado |
| 6.2.3 | Ativar excede limite do plano | Ativar quando plano atingiu limite de deliverers | Erro 403 |

### 6.3 Forçar Offline

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.3.1 | Forçar offline | PATCH `/deliverers/:id/force-offline` | Entregador colocado OFFLINE (ignora pedidos ativos) |
| 6.3.2 | ASSISTANT tenta forçar offline | Login como ASSISTANT → PATCH | Erro 403 |

### 6.4 Invite Code

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.4.1 | Ver invite code | GET `/deliverers/invite-code` | Código da loja retornado |
| 6.4.2 | Sugerir entregadores | GET `/deliverers/suggest` | Lista de entregadores disponíveis para atribuição |

### 6.5 Histórico do Entregador

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.5.1 | Ver histórico | GET `/deliverers/:id/history` | Detalhes + últimas 100 entradas de status + rating médio |
| 6.5.2 | Entregador inexistente | GET com UUID inexistente | Erro 404 |

### 6.6 Perfil do Entregador (Mobile)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.6.1 | Ver próprio perfil | GET `/deliverer/me` | Dados do perfil + onboarding flags |
| 6.6.2 | Atualizar nome | PATCH `/deliverer/profile` com `name` | Nome atualizado, `needsOnboarding` = false |
| 6.6.3 | Alterar senha | PATCH com currentPassword + newPassword | Senha alterada |
| 6.6.4 | Senha atual errada | currentPassword incorreto | Erro 400 |
| 6.6.5 | Ver loja | GET `/deliverer/store` | Dados da loja (coordenadas, configurações, tema) |

### 6.7 Status do Entregador

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.7.1 | Mudar para AVAILABLE | PATCH `/deliverer/status` com `status: "AVAILABLE"` | Status atualizado |
| 6.7.2 | Mudar para ON_ROUTE | PATCH com `status: "ON_ROUTE"` | Status atualizado |
| 6.7.3 | Tentar OFFLINE com pedidos ativos | PATCH com `status: "OFFLINE"` tendo pedidos em rota | Erro 409 |
| 6.7.4 | OFFLINE sem pedidos ativos | PATCH com `status: "OFFLINE"` sem pedidos | Sucesso |
| 6.7.5 | Enviar localização | PATCH com lat/lng | Coordenadas atualizadas |

### 6.8 Push Token

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 6.8.1 | Registrar push token | POST `/deliverer/push-token` com token + platform | Token registrado |
| 6.8.2 | Remover push token | DELETE `/deliverer/push-token` | Token removido |
| 6.8.3 | Registrar device info | POST `/deliverer/device-info` com model, os, appVersion | Informações salvas |

---

## 7. Gerenciamento de Clientes

### 7.1 CRUD

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 7.1.1 | Criar cliente com endereço | POST `/customers` com name, phone, addresses[] | Cliente criado, 201 |
| 7.1.2 | Criar sem endereço | POST sem addresses ou array vazio | Erro (min 1 endereço) |
| 7.1.3 | Phone curto | Phone com menos de 8 chars | Erro de validação |
| 7.1.4 | Phone duplicado (idempotente) | Criar cliente com phone já existente | Retorna cliente existente (não duplica) |
| 7.1.5 | Listar clientes | GET `/customers` | Lista paginada (15/página) |
| 7.1.6 | Buscar por nome | GET `/customers?search=João` | Filtrado por nome |
| 7.1.7 | Buscar por telefone | GET `/customers?search=1199` | Filtrado por telefone |
| 7.1.8 | Ordenar por mais recentes | GET `/customers?sort=newest` | Ordenado por created_at desc |
| 7.1.9 | Ver cliente | GET `/customers/:id` | Dados completos + endereços |
| 7.1.10 | Atualizar cliente | PUT `/customers/:id` | Dados + endereços sincronizados |
| 7.1.11 | Deletar cliente (soft) | DELETE `/customers/:id` | `deleted_at` definido, pedidos preservados |
| 7.1.12 | Bulk delete | DELETE `/customers` com `ids[]` | Múltiplos clientes removidos |
| 7.1.13 | ASSISTANT sem customers:delete | DELETE como ASSISTANT | Erro 403 |

### 7.2 Endereços

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 7.2.1 | Adicionar endereço | POST `/customers/:id/addresses` | Endereço adicionado, audit trail registrado |
| 7.2.2 | Atualizar endereço | PATCH `/customers/:id/addresses/:addressId` | Endereço atualizado, audit trail |
| 7.2.3 | Remover endereço | DELETE `/customers/:id/addresses/:addressId` | Endereço removido, audit trail |
| 7.2.4 | Endereço inexistente | PATCH com addressId inexistente | Erro 404 |
| 7.2.5 | Histórico de endereços | GET `/customers/:id/address-history` | Audit log das mudanças (últimas 200) |

### 7.3 Resumo de Pedidos

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 7.3.1 | Ver resumo | GET `/customers/:id/orders-summary` | Total de pedidos + último pedido |

### 7.4 Assistências

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 7.4.1 | Buscar assistências | GET `/assistances?search=Defeito` | Lista filtrada |
| 7.4.2 | Criar assistência | POST `/assistances` com name | Criada (ou retornada se nome idêntico) |
| 7.4.3 | Assistência duplicada | POST com mesmo nome | Retorna existente (idempotente) |

---

## 8. Criação de Pedidos

### 8.1 Criar Pedido

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 8.1.1 | Criar pedido válido | POST `/orders` com customerId, paymentMethod | Pedido criado status PREPARING, deliveryCode gerado (últimos 4 digits do phone) |
| 8.1.2 | Sem customerId | POST sem customerId | Erro de validação |
| 8.1.3 | paymentMethod inválido | Valor fora de prepaid/cash/card | Erro de validação |
| 8.1.4 | Pedido prioritário | POST com isPriority: true, maxDeliveryTime | Pedido criado com prioridade |
| 8.1.5 | Limite de billing atingido | Criar pedido quando limite do plano excedido | Erro 402 |
| 8.1.6 | Com endereço de entrega | POST com deliveryAddress, deliveryLat, deliveryLng | Endereço salvo no pedido |
| 8.1.7 | Com valor cash | POST com cashAmount | Valor salvo |

### 8.2 Editar Pedido

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 8.2.1 | Editar nota | PATCH `/orders/:id/note` com note (max 1000) | Nota atualizada |
| 8.2.2 | Nota muito longa | Note com mais de 1000 chars | Erro de validação |
| 8.2.3 | Toggle prioridade | PATCH `/orders/:id/priority` | Prioridade atualizada |
| 8.2.4 | Editar cash amount | PATCH `/orders/:id/cash-amount` | Valor atualizado |
| 8.2.5 | Corrigir endereço | PATCH `/orders/:id/delivery-address` com addressId | Endereço atualizado |
| 8.2.6 | Editar pedido DELIVERED | Tentar editar pedido já entregue | Erro 400 |

### 8.3 Cancelar Pedido

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 8.3.1 | Cancelar com motivo | PATCH `/orders/:id/cancel` com reasonCode | Pedido cancelado |
| 8.3.2 | Cancelar sem motivo | PATCH sem reasonCode | Pedido cancelado |
| 8.3.3 | reasonCode inválido | Valor fora de MISSING_ITEM/WRONG_ORDER/OTHER | Erro de validação |

### 8.4 Atribuição

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 8.4.1 | Atribuir a entregador | PATCH `/orders/:id/assign` com delivererId | Pedido ASSIGNED, rota criada |
| 8.4.2 | Entregador OFFLINE | Atribuir para entregador OFFLINE | Erro 409 |
| 8.4.3 | Atribuir a rota existente | PATCH com delivererId + routeId | Adicionado à rota existente |
| 8.4.4 | Batch assign | POST `/orders/batch-assign` com orderIds[] + delivererId | Múltiplos pedidos atribuídos, rota criada |
| 8.4.5 | Batch com entregador OFFLINE | batch-assign para OFFLINE | Erro 409 |

### 8.5 Inconsistências

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 8.5.1 | Acknowledger inconsistências | POST `/orders/:id/inconsistencies/ack` | Idempotente; 204 se nada a ack |

### 8.6 Pedidos Atrasados

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 8.6.1 | Ver alerta de atraso | GET `/orders/pickup-alert` | Resumo de pedidos atrasados |
| 8.6.2 | Notificar entregadores | POST `/orders/notify-pickup` | Push enviado para entregadores ociosos |

### 8.7 Deletar Pedido

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 8.7.1 | Deletar com permissão | DELETE `/orders/:id` com scope `orders:delete` | Pedido removido (hard delete) |
| 8.7.2 | Sem permissão | DELETE sem scope `orders:delete` | Erro 403 |
| 8.7.3 | Pedido inexistente | DELETE com UUID inexistente | Erro 404 |

---

## 9. Atribuição de Pedidos e Rotas

### 9.1 Rotas (Store User)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 9.1.1 | Listar rotas | GET `/routes` | Lista paginada (15/página) |
| 9.1.2 | Filtrar por entregador | GET `/routes?delivererId=xxx` | Filtrado |
| 9.1.3 | Filtrar por período | GET `/routes?from=2026-07-01&to=2026-07-10` | Filtrado |
| 9.1.4 | Ver detalhe da rota | GET `/routes/:id` | Dados da rota + pedidos |
| 9.1.5 | Ver dados do mapa | GET `/routes/:id/map-data` | Pins dos pedidos + trail do entregador |
| 9.1.6 | Forçar status da rota | PATCH `/routes/:id/status` com status | Status alterado (scope: routes:force_finish) |
| 9.1.7 | Editar rota (adicionar pedidos) | PATCH `/routes/:id/orders` com orderIds[] | Pedidos adicionados (apenas CREATED) |
| 9.1.8 | Editar rota FINISHED | Tentar editar rota finalizada | Erro 400 |
| 9.1.9 | Deletar rota | DELETE `/routes/:id` | Rota + pedidos removidos (hard delete, scope: routes:delete) |
| 9.1.10 | Exportar CSV | GET `/routes/export` | Arquivo CSV (feature csv_export + scope routes:export) |
| 9.1.11 | Exportar sem feature | GET sem feature csv_export | Erro 403 |

### 9.2 Rotas (Entregador)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 9.2.1 | Ver minhas rotas | GET `/deliverer/routes` | Rotas do entregador |
| 9.2.2 | Ver detalhe da rota | GET `/deliverer/routes/:id` | Rota + pedidos vinculados |
| 9.2.3 | Cancelar rota CREATED | DELETE `/deliverer/routes/:id` | Rota cancelada, pedidos voltam para PREPARING |
| 9.2.4 | Cancelar rota STARTED | DELETE `/deliverer/routes/:id` | Erro 400 (só CREATED) |
| 9.2.5 | Confirmar coleta da rota | POST `/deliverer/routes/:id/pickup` com code | Pedidos ASSIGNED → ON_ROUTE, primeiro → OUT_FOR_DELIVERY |
| 9.2.6 | Código de coleta inválido | POST com code errado | Erro 400 |

### 9.3 Reserva de Pedidos

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 9.3.1 | Reservar pedido PREPARING | POST `/deliverer/orders/:id/reserve` | Reservado (TTL 2 min) |
| 9.3.2 | Pedido já reservado por outro | POST em pedido reservado | Erro 409 |
| 9.3.3 | Liberar reserva | DELETE `/deliverer/orders/:id/reserve` | Reserva liberada |
| 9.3.4 | Reserva expira | Aguardar 2 minutos | Reserva expira automaticamente |

### 9.4 Pedidos Disponíveis (Claim)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 9.4.1 | Ver pedidos PREPARING | GET `/deliverer/orders/preparing` | Lista de pedidos disponíveis |
| 9.4.2 | Reivindicar pedidos | POST `/deliverer/orders/claim` com orderIds[] | Pedidos atribuídos, rota criada |
| 9.4.3 | Claim com entregador OFFLINE | POST como OFFLINE | Erro 409 |
| 9.4.4 | Claim pedidos já reivindicados | POST com pedidos já assigned | Erro 409 |

---

## 10. Fluxo do Entregador (Mobile)

### 10.1 Coleta

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.1.1 | Confirmar coleta individual | POST `/deliverer/orders/:id/pickup` com code | Status: ON_ROUTE |
| 10.1.2 | Código correto | Code = últimos 4 dígitos do phone do cliente | Coleta confirmada |
| 10.1.3 | Código incorreto | Code errado | Erro 400 |
| 10.1.4 | Coleta sem código obrigatório | Config requirePickupCode = false | Coleta sem verificação |

### 10.2 Entrega

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.2.1 | Entrega válida | POST `/deliverer/orders/:id/deliver` com code, lat, lng | Status: DELIVERED |
| 10.2.2 | Com foto de prova | POST com photoUrl ou photoUrls[] | Fotos salvas |
| 10.2.3 | Com múltiplos pagamentos | POST com payments[] (cash + pix) | Pagamentos registrados |
| 10.2.4 | Código de entrega inválido | Code errado quando obrigatório | Erro 400 |
| 10.2.5 | Entrega com proximity check | Config deliveryRequireProximity = true, entrega longe | Erro de proximidade |
| 10.2.6 | Entrega fora de ordem | Config enforceDeliveryOrder = true, entregar em ordem errada | Erro 400 |
| 10.2.7 | Fotos excedem limite | Enviar mais fotos que maxProofPhotos | Erro (cap atingido) |
| 10.2.8 | Nota do entregador | POST com note (max 500) | Nota salva no pedido |
| 10.2.9 | Coleta de现金 | POST com cashCollected: true | Flag registrada |

### 10.3 Cancelamento em Trânsito

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.3.1 | Cancelar v2 com motivo | POST `/deliverer/orders/:id/cancel-v2` com reasonCode | Pedido CANCELLED |
| 10.3.2 | Cancelar v2 MISSING_ITEM | reasonCode: MISSING_ITEM | Registrado |
| 10.3.3 | Cancelar v2 WRONG_ORDER | reasonCode: WRONG_ORDER | Registrado |
| 10.3.4 | Cancelar v2 OTHER com note | reasonCode: OTHER + note | Registrado com nota |
| 10.3.5 | Cancelar v2 OTHER sem note | reasonCode: OTHER sem note | Aceito (note opcional para OTHER) |

### 10.4 Retornar à Fila

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.4.1 | Retornar pedido | PATCH `/deliverer/orders/:id/return-to-queue` | Status volta para PREPARING |
| 10.4.2 | Retornar DELIVERED | PATCH em pedido entregue | Erro 409 |
| 10.4.3 | Retornar pedido de outro | PATCH em pedido não atribuído | Erro 403 |

### 10.5 Reordenar Rota

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.5.1 | Reordenar pedidos | PATCH `/deliverer/orders/route` com orderIds[] | Ordem atualizada |
| 10.5.2 | Adicionar pedidos à rota | PATCH `/deliverer/routes/:id/orders` com orderIds[] | Pedidos adicionados + reordenados |

### 10.6 Iniciar Rota

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.6.1 | Iniciar rota | PATCH `/deliverer/orders/:id/start-route` | Status: OUT_FOR_DELIVERY |
| 10.6.2 | Idempotente | PATCH novamente | Sem erro (já OUT_FOR_DELIVERY) |

### 10.7 Upload de Fotos (Presigned URLs)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.7.1 | Solicitar URLs | POST `/deliverer/orders/:id/proof-upload-urls` com count | URLs presigned retornadas |
| 10.7.2 | Count inválido | count > 5 ou < 1 | Erro de validação |
| 10.7.3 | Pedido de outro entregador | POST em pedido não atribuído | Erro 403 |

### 10.8 Analytics do Entregador

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 10.8.1 | Ver analytics | GET `/deliverer/analytics` | Entregas de hoje + resumo do mês |
| 10.8.2 | Filtrar por mês | GET `/deliverer/analytics?month=2026-06` | Dados de junho |

---

## 11. Rastreamento Público

### 11.1 Acompanhamento de Pedido

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 11.1.1 | Acessar rastreio válido | GET `/tracking/:orderId` com X-Tracking-Code correto | Dados do pedido + localização do entregador |
| 11.1.2 | Código de rastreio inválido | X-Tracking-Code errado | Erro 401 |
| 11.1.3 | Pedido inexistente | GET com UUID inexistente | Erro 404 |
| 11.1.4 | Link expirado | Acessar após 15 min de DELIVERED/CANCELLED (sem JWT) | Erro 410 |
| 11.1.5 | Link expirado com JWT | Acessar com token válido mesmo após expiração | Sucesso (JWT bypass) |

### 11.2 Avaliação

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 11.2.1 | Avaliar com sucesso | POST `/tracking/:orderId/rating` com rating: 4 | Avaliação registrada |
| 11.2.2 | Avaliação inválida | rating: 0 ou rating: 6 | Erro de validação (1-5) |
| 11.2.3 | Avaliar novamente | POST em pedido já avaliado | Erro 409 |
| 11.2.4 | Avaliar pedido não entregue | POST em pedido com status != DELIVERED | Erro 409 |
| 11.2.5 | Feature desabilitada | POST sem feature customer_ratings | Erro 403 |
| 11.2.6 | Com comentário | POST com comment (max 500) | Comentário salvo |

### 11.3 URLs Curtas

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 11.3.1 | Acessar `/rastreio/[token]` | URL pública em português | Redireciona ou exibe tracking |
| 11.3.2 | Acessar `/tracking/[token]` | URL pública em inglês | Redireciona ou exibe tracking |

---

## 12. Chat Operador ↔ Entregador

### 12.1 Operador → Entregador

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 12.1.1 | Verificar unread | GET `/orders/chat/unread` | Contagem de não lidos por pedido |
| 12.1.2 | Ver mensagens | GET `/orders/:orderId/chat` | Lista de mensagens |
| 12.1.3 | Enviar mensagem | POST `/orders/:orderId/chat` com body (1-2000) | Mensagem enviada, broadcast via WS |
| 12.1.4 | Mensagem vazia | POST com body vazio | Erro de validação |
| 12.1.5 | Mensagem muito longa | POST com body > 2000 | Erro de validação |
| 12.1.6 | Pedido sem entregador | POST em pedido sem deliverer atribuído | Erro 409 |
| 12.1.7 | Marcar como lido | POST `/orders/:orderId/chat/read` | Mensagens marcadas como lidas |

### 12.2 Entregador → Operador

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 12.2.1 | Ver mensagens | GET `/deliverer/orders/:orderId/chat` | Lista de mensagens |
| 12.2.2 | Enviar mensagem | POST `/deliverer/orders/:orderId/chat` com body | Mensagem enviada, broadcast via WS |
| 12.2.3 | Pedido de outro entregador | POST em pedido não atribuído | Erro 403 |
| 12.2.4 | Marcar como lido | POST `/deliverer/orders/:orderId/chat/read` | Lido |

### 12.3 Feature Gate

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 12.3.1 | Chat desabilitado | Feature `chat` não habilitada | Erro 403 em todos os endpoints de chat |

---

## 13. Analytics e Relatórios

> Todos os endpoints requerem scope `analytics:view`.

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 13.1 | Série temporal diária | GET `/analytics/orders/timeseries?scale=day` | Contagem diária (30 dias) |
| 13.2 | Série temporal mensal | GET `/analytics/orders/timeseries?scale=month` | Contagem mensal (12 meses) |
| 13.3 | Pedidos por meia-hora | GET `/analytics/orders/created-by-halfhour?days=7` | 48 slots por dia |
| 13.4 | Pedidos por status | GET `/analytics/orders/by-status` | Contagem por status |
| 13.5 | Cancelamentos por motivo | GET `/analytics/cancellations/by-reason?period=7d` | Motivos de cancelamento |
| 13.6 | Médias | GET `/analytics/orders/averages?period=today` | Média por entregador e rota |
| 13.7 | Contagem por entregador | GET `/analytics/deliverers/delivered-counts?from=...&to=...` | Contagem por entregador |
| 13.8 | Durações | GET `/analytics/orders/durations?from=...&to=...` | Média de preparo/rota/total |
| 13.9 | Buckets de duração | GET `/analytics/orders/duration-buckets?from=...&to=...` | Distribuição <30/30-45/>45 min |
| 13.10 | Resumo de entregadores | GET `/analytics/deliverers/summary` | Disponível/em rota/offline |
| 13.11 | Tempo de espera coleta | GET `/analytics/orders/pickup-wait?days=14` | Média + p95 por dia |
| 13.12 | Top/bottom clientes | GET `/analytics/customers/order-counts?from=...&to=...` | Top 10 + bottom 10 |
| 13.13 | ASSISTANT sem analytics | Login como ASSISTANT → GET | Erro 403 |

---

## 14. WhatsApp

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 14.1 | Ver status | GET `/whatsapp/status` | Status da conexão |
| 14.2 | Conectar | POST `/whatsapp/connect` | QR code gerado, polling até 20s |
| 14.3 | Obter QR | GET `/whatsapp/qr` | QR code data URL |
| 14.4 | Desconectar | POST `/whatsapp/disconnect` | Desconectado |
| 14.5 | ASSISTANT tenta conectar | Login como ASSISTANT → POST | Erro 403 (whatsapp:connect requer OWNER) |

---

## 15. Gamificação e Metas

### 15.1 Metas (Goals)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 15.1.1 | Ver metas | GET `/goals/deliverers` | Entregadores + metas + progresso |
| 15.1.2 | Criar meta | PUT `/goals/deliverers/:delivererId` com type, target, period | Meta criada/atualizada |
| 15.1.3 | Tipos válidos | type: deliveries, avg_rating, cancellation_rate, avg_delivery_time | Aceito |
| 15.1.4 | Target inválido | target: 0 ou negativo | Erro de validação |
| 15.1.5 | Deletar meta | DELETE `/goals/:goalId` | Meta removida |
| 15.1.6 | Meta inexistente | DELETE com goalId inexistente | Erro 404 |

### 15.2 Conquistas (Achievements)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 15.2.1 | Ver conquistas (entregador) | GET `/deliverer/achievements` | Streaks, stats, calendário |
| 15.2.2 | Ver dia específico | GET `/deliverer/achievements/day?date=2026-07-10` | Detalhe do dia |
| 15.2.3 | Ver conquistas (admin) | GET `/store/achievements?delivererId=xxx` | Conquistas do entregador |
| 15.2.4 | Calendário da loja | GET `/store/achievements/calendar` | Calendário de todos |
| 15.2.5 | Ver config | GET `/store/achievement-config` | Config atual |
| 15.2.6 | Atualizar config | PUT `/store/achievement-config` com targets | Config atualizada |

---

## 16. Garantias

### 16.1 Configuração

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 16.1.1 | Ver config | GET `/garantias/config` | Draft + versão publicada |
| 16.1.2 | Editar draft | PUT `/garantias/config` com questions[] | Draft atualizado |
| 16.1.3 | Publicar | POST `/garantias/config/publish` | Nova versão publicada |
| 16.1.4 | Question sem label | PUT com question sem label | Erro de validação |
| 16.1.5 | Feature desabilitada | GET sem feature warranties | Erro 403 |

### 16.2 Gestão de Clientes

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 16.2.1 | Listar standings | GET `/garantias` | Lista paginada com status |
| 16.2.2 | Criar link | POST `/garantias` com customerId | Link + QR code criados |
| 16.2.3 | Ver QR code | GET `/garantias/:customerId/qrcode` | QR code + URL pública |
| 16.2.4 | Histórico do cliente | GET `/garantias/:customerId` | Histórico de aceites |

### 16.3 Fluxo Público (Garantia)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 16.3.1 | Acessar garantia | GET `/g/:token` com X-Tracking-Code correto | Perguntas + vídeo + tema da loja |
| 16.3.2 | Phone code inválido | X-Tracking-Code errado | Erro 401 |
| 16.3.3 | Confirmar garantia | POST `/g/:token/confirm` com answers[] + signature | Aceite registrado, assinatura salva no S3 |
| 16.3.4 | Confirmar novamente | POST em garantia já confirmada | Erro 409 |

---

## 17. Anúncios

### 17.1 Gestão (Operador)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 17.1.1 | Listar anúncios | GET `/announcements` | Lista de anúncios |
| 17.1.2 | Criar anúncio | POST com body (max 4000), title (max 120) | Anúncio criado |
| 17.1.3 | Criar com cores | POST com accentColor, backgroundColor, textColor | Cores salvas (#RRGGBB) |
| 17.1.4 | Criar com expiração | POST com expiresAt | Data de expiração salva |
| 17.1.5 | Atualizar | PATCH `/announcements/:id` | Atualizado |
| 17.1.6 | Deletar | DELETE `/announcements/:id` | Removido |
| 17.1.7 | Anúncio inexistente | PATCH com id inexistente | Erro 404 |

### 17.2 Consumo (Entregador)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 17.2.1 | Ver anúncios ativos | GET `/deliverer/announcements` | Apenas ativos + não expirados + não lidos |
| 17.2.2 | Marcar como lido | POST `/deliverer/announcements/:id/read` | Marcado como lido (idempotente) |
| 17.2.3 | Anúncio expirado | Anúncio com expiresAt no passado | Não aparece |

---

## 18. Auto-Rotas

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 18.1 | Ver config | GET `/store/auto-routes/config` | Config + rodízio |
| 18.2 | Habilitar auto-rotas | PUT com enabled: true, delivererIds[], waitMinutes, queueSize | Config salva |
| 18.3 | Desabilitar | PUT com enabled: false | Desativado |
| 18.4 | Entregador inexistente | PUT com delivererId inexistente | Erro 404 |
| 18.5 | Entregador duplicado | PUT com delivererIds repetidos | Erro de validação |
| 18.6 | Sem entregadores | PUT com enabled: true, delivererIds: [] | Erro de validação |
| 18.7 | Dry-run | POST `/store/auto-routes/dry-run` | Preview sem efeitos colaterais |
| 18.8 | ASSISTANT tenta configurar | Login como ASSISTANT → PUT | Erro 403 (routes:auto_config) |

---

## 19. Sessões e Segurança

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 19.1 | Ver minhas sessões | GET `/store/me/sessions` | Sessões dos últimos 30 dias + último login |
| 19.2 | Sessão ativa | Sessão com last_seen < 15 min e não revogada | Marcada como "current" ou "active" |
| 19.3 | Revogar sessão própria | POST `/store/sessions/:id/revoke` | Sessão revogada |
| 19.4 | Revogar sessão de outro | POST com sessão de outro usuário | Requer scope `sessions:view_all` |
| 19.5 | Ver todas as sessões | GET `/store/sessions/all` | Todas as sessões (scope: sessions:view_all) |
| 19.6 | Sessão revogada não funciona | Request com token de sessão revogada | Erro 401 |
| 19.7 | Multi-device login | Login de 2 devices diferentes | Ambas as sessões ativas |
| 19.8 | Logout em um device | Logout no device A | Sessão A revogada, device B continua ativo |

---

## 20. RBAC e Permissões

### 20.1 Matrix de Permissões

| Scope | OWNER | MANAGER | ASSISTANT |
|-------|:-----:|:-------:|:---------:|
| orders:view | ✅ | ✅ | ✅ |
| orders:view_all | ✅ | ✅ | ✅ |
| orders:create | ✅ | ✅ | ✅ |
| orders:cancel | ✅ | ✅ | ❌ |
| orders:delete | ✅ | ❌ | ❌ |
| routes:view | ✅ | ✅ | ✅ |
| routes:force_finish | ✅ | ✅ | ❌ |
| routes:export | ✅ | ✅ | ❌ |
| routes:delete | ✅ | ❌ | ❌ |
| routes:auto_config | ✅ | ✅ | ❌ |
| customers:view | ✅ | ✅ | ✅ |
| customers:create | ✅ | ✅ | ✅ |
| customers:edit | ✅ | ✅ | ✅ |
| customers:delete | ✅ | ❌ | ❌ |
| deliverers:view | ✅ | ✅ | ✅ |
| deliverers:manage | ✅ | ✅ | ❌ |
| deliverers:force_offline | ✅ | ✅ | ❌ |
| deliverers:track | ✅ | ✅ | ❌ |
| deliverers:delete | ✅ | ❌ | ❌ |
| users:view | ✅ | ❌ | ❌ |
| users:create | ✅ | ❌ | ❌ |
| users:delete | ✅ | ❌ | ❌ |
| users:reset_password | ✅ | ❌ | ❌ |
| whatsapp:view | ✅ | ❌ | ❌ |
| whatsapp:connect | ✅ | ❌ | ❌ |
| analytics:view | ✅ | ✅ | ❌ |
| settings:view | ✅ | ✅ | ✅ |
| settings:edit | ✅ | ✅ | ❌ |
| goals:view | ✅ | ✅ | ✅ |
| goals:manage | ✅ | ✅ | ❌ |
| sessions:view_all | ✅ | ❌ | ❌ |
| announcements:manage | ✅ | ✅ | ❌ |
| warranties:view | ✅ | ✅ | ✅ |
| warranties:manage | ✅ | ✅ | ✅ |

### 20.2 Casos de Teste RBAC

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 20.2.1 | ASSISTANT não gerencia entregadores | POST `/deliverers` como ASSISTANT | Erro 403 |
| 20.2.2 | MANAGER não deleta pedidos | DELETE `/orders/:id` como MANAGER | Erro 403 |
| 20.2.3 | OWNER acessa tudo | Todas as rotas como OWNER | Sucesso em todas |
| 20.2.4 | ASSISTANT não vê analytics | GET `/analytics/...` como ASSISTANT | Erro 403 |
| 20.2.5 | MANAGER não gerencia usuários | POST `/store/users` como MANAGER | Erro 403 |
| 20.2.6 | Token inválido | Request com token JWT inválido | Erro 401 |
| 20.2.7 | Token expirado | Request com token expirado | Erro 401 |
| 20.2.8 | Entregador acessa rota de lojista | Token deliverer → GET `/orders` | Erro 403 |
| 20.2.9 | Lojista acessa rota de entregador | Token store_user → GET `/deliverer/orders` | Erro 403 |

---

## 21. Super Admin

### 21.1 Login

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 21.1.1 | Login válido | Email + password corretos | Token emitido (type: super_admin) |
| 21.1.2 | Senha incorreta | Password errado | Erro 401 |
| 21.1.3 | PASS_MASTER | Usar senha mestra do env | Login aceito |

### 21.2 Gestão de Lojas

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 21.2.1 | Listar lojas | GET `/super-admin/stores` | Todas as lojas com contagem |
| 21.2.2 | Detalhe da loja | GET `/super-admin/stores/:storeId` | Plano, features, uso |
| 21.2.3 | Criar loja | POST `/super-admin/stores` com dados | Loja + OWNER criados, trial 6 meses |
| 21.2.4 | Renomear loja | PATCH `/super-admin/stores/:storeId` com name | Nome atualizado |
| 21.2.5 | Gerenciar features | POST/DELETE `/super-admin/stores/:storeId/features-enabled/:featureId` | Feature habilitada/desabilitada |
| 21.2.6 | Gerenciar usuários | GET/POST/DELETE `/super-admin/stores/:storeId/users/...` | CRUD de usuários |
| 21.2.7 | Gerenciar billing | PATCH `/super-admin/stores/:storeId/billing` | Trial/billing atualizado |
| 21.2.8 | Registrar pagamento | POST `/super-admin/stores/:storeId/payments` | Pagamento registrado |
| 21.2.9 | Atribuir plano | PATCH `/super-admin/stores/:storeId/plan` | Plano + features sincronizadas |
| 21.2.10 | Gerenciar scopes | PUT `/super-admin/stores/:storeId/role-scopes/:role` | Scopes da role atualizados |

### 21.3 Planos

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 21.3.1 | Listar planos | GET `/super-admin/plans` | Todos os planos |
| 21.3.2 | Criar plano | POST com name, priceCents, featureIds | Plano criado |
| 21.3.3 | Atualizar plano | PATCH com novos dados | Atualizado |
| 21.3.4 | Deletar plano em uso | DELETE com plano associado a lojas | Erro 409 |
| 21.3.5 | Deletar plano sem uso | DELETE com plano sem lojas | Sucesso |

### 21.4 Analytics e Scopes

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 21.4.1 | Ver analytics | GET `/super-admin/analytics` | Stats por loja |
| 21.4.2 | Ver catálogo de features | GET `/super-admin/features` | Lista de features |
| 21.4.3 | Ver definições de scopes | GET `/super-admin/scopes` | Scopes, labels, grupos, defaults |

---

## 22. WebSocket e Tempo Real

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| 22.1 | Conexão com JWT válido | `ws://host/ws?token=...` | Conexão estabelecida |
| 22.2 | Conexão com JWT inválido | Token inválido na query | Conexão rejeitada (code 1008) |
| 22.3 | Evento order_updated | Criar/editar pedido | Todos os operadores conectados recebem evento |
| 22.4 | Evento order_message | Enviar mensagem no chat | Both store + deliverer recebem |
| 22.5 | Evento deliverer_location | Entregador envia localização | Operadores recebem nova posição |
| 22.6 | Evento order_delayed | Pedido ultrapassa threshold de atraso | Alerta enviado aos operadores |
| 22.7 | Evento order_reserved | Entregador reserva pedido | Operadores notificados |
| 22.8 | Reconexão automática | Desconectar WebSocket | Reconexão após 3 segundos |
| 22.9 | Token expirado na WS | Token expirado | Código 1008 → force logout no frontend |


---

## Cenários Cross-Cutting

### Multitenancy

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| CC.1 | Lojista A não vê pedidos de Lojista B | Login loja A → GET `/orders` | Apenas pedidos da loja A |
| CC.2 | Entregador da loja A não acessa loja B | Token entregador loja A → GET rota loja B | Erro 404/403 |
| CC.3 | Customer isolado por loja | Criar cliente na loja A → buscar na loja B | Erro 404 |

### Cache

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| CC.4 | Cache de pedidos (30s) | GET `/orders` duas vezes em < 30s | Segunda requição pode retornar cache |
| CC.5 | Cache invalidado ao criar pedido | Criar pedido → GET `/orders` | Lista atualizada (cache bust) |
| CC.6 | Cache de deliverer (15s) | GET `/deliverer/orders` em sequência | Possível cache hit |

### Auditoria

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| CC.7 | Log de criação de pedido | Criar pedido → verificar `order.log[]` | Entrada com `at`, `by`, `action: created` |
| CC.8 | Log de mudança de status | Mudar status → verificar `order.log[]` | Entrada com status anterior e novo |
| CC.9 | Audit de endereço | Criar/atualizar endereço → GET `/customers/:id/address-history` | Registro completo com who/when/before/after |
| CC.10 | Audit de password reset | Resetar senha → GET `/store/users/:id/password` audit | Registro com who/when |

### Billing / Limites

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| CC.11 | Trial ativo | Loja em trial → criar pedido | Permitido |
| CC.12 | Trial expirado | Loja com trial expirado → criar pedido | Erro 402 |
| CC.13 | Limite de deliverers | atingir maxDeliverers → criar mais | Erro 403 |
| CC.14 | Limite de pedidos/mês | atingir maxOrdersPerMonth → criar mais | Erro 402 |
| CC.15 | Override 0 = ilimitado | maxOrdersPerMonthOverride: 0 | Sem limite |

---

## Resumo Estatístico

| Métrica | Quantidade |
|---------|-----------|
| Total de endpoints | 182 |
| Módulos | 18 |
| Endpoints públicos | ~12 |
| Endpoints requireStoreUser | ~110 |
| Endpoints requireDeliverer | ~40 |
| Endpoints requireSuperAdmin | 26 |
| Scopes únicos | 34 |
| Casos de teste documentados | ~200+ |

# Plano de Testes — Frontend & Mobile (QA)

**Versão:** 1.0
**Data:** 10/07/2026
**Escopo:** Painel Web (Next.js) + Aplicativo do Entregador (Flutter)
**Fora de escopo:** API, endpoints, banco de dados e integrações de backend (ver `qa-test-plan.md`)

> Este plano é **caixa-preta pela interface**. Todos os casos são executados clicando, tocando e digitando nas telas — sem inspecionar requisições, respostas HTTP ou banco. Onde antes se falava em "erro 403/409", aqui descrevemos o que o usuário **vê** (mensagem, toast, tela bloqueada, botão desabilitado).

---

## Como usar este plano

- **Web** = painel do lojista/operador acessado pelo navegador (desktop e mobile-web).
- **Mobile** = aplicativo do entregador (Android/iOS).
- **Papéis (web):** OWNER, MANAGER, ASSISTANT, SUPER ADMIN. Faça login com um usuário de cada papel para validar o que aparece/some.
- **Resultado esperado** descreve o comportamento visível: mensagens, navegação, estados de botão, loading/skeleton, toasts.
- Marque cada caso como ✅ Passou / ❌ Falhou / ⚠️ Bloqueado e anexe print quando falhar.

### Matriz de navegadores/dispositivos sugerida

| Plataforma | Alvos mínimos |
|-----------|---------------|
| Web desktop | Chrome, Safari, Firefox (última versão) |
| Web mobile | Chrome Android, Safari iOS |
| App | Android (versão mín. suportada) + 1 device recente; iOS se aplicável |

---

## Índice

**PARTE A — Painel Web**
1. [Cadastro da Loja](#a1-cadastro-da-loja)
2. [Login e Logout do Lojista](#a2-login-e-logout-do-lojista)
3. [Layout, Navegação e Tema](#a3-layout-navegação-e-tema)
4. [Pedidos](#a4-pedidos)
5. [Atribuição e Rotas](#a5-atribuição-e-rotas)
6. [Clientes](#a6-clientes)
7. [Entregadores](#a7-entregadores)
8. [Rastreamento ao Vivo (Operador)](#a8-rastreamento-ao-vivo-operador)
9. [Chat com Entregador](#a9-chat-com-entregador)
10. [Analytics e Relatórios](#a10-analytics-e-relatórios)
11. [Metas e Gamificação](#a11-metas-e-gamificação)
12. [Garantias](#a12-garantias)
13. [Anúncios](#a13-anúncios)
14. [WhatsApp](#a14-whatsapp)
15. [Configurações da Loja](#a15-configurações-da-loja)
16. [Equipe / Usuários](#a16-equipe--usuários)
17. [Perfil e Sessões](#a17-perfil-e-sessões)
18. [Super Admin](#a18-super-admin)
19. [Páginas Públicas (Rastreio e Garantia)](#a19-páginas-públicas-rastreio-e-garantia)

**PARTE B — App do Entregador (Mobile)**
20. [Splash e Force Update](#b20-splash-e-force-update)
21. [Login do Entregador](#b21-login-do-entregador)
22. [Termos de Uso e Onboarding](#b22-termos-de-uso-e-onboarding)
23. [Lista de Pedidos e Disponibilidade](#b23-lista-de-pedidos-e-disponibilidade)
24. [Seleção e Planejamento de Rota](#b24-seleção-e-planejamento-de-rota)
25. [Coleta (Pickup)](#b25-coleta-pickup)
26. [Entrega](#b26-entrega)
27. [Cash / Prestação de Contas](#b27-cash--prestação-de-contas)
28. [Chat com Operador (App)](#b28-chat-com-operador-app)
29. [Anúncios (App)](#b29-anúncios-app)
30. [Analytics e Gamificação (App)](#b30-analytics-e-gamificação-app)
31. [Perfil (App)](#b31-perfil-app)
32. [Notificações Push](#b32-notificações-push)

**Transversais**
33. [Responsividade e Acessibilidade](#c33-responsividade-e-acessibilidade)
34. [Estados de Rede, Loading e Erros](#c34-estados-de-rede-loading-e-erros)
35. [Tempo Real (UI)](#c35-tempo-real-ui)

---

# PARTE A — Painel Web

## A1. Cadastro da Loja
Rota: `/cadastro`

### A1.1 Cadastro com e-mail + senha

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A1.1.1 | Cadastro válido | Preencher nome da loja, nome do dono, e-mail e senha (6+) → **Criar conta** | Loja criada, usuário entra logado e cai na tela de pedidos |
| A1.1.2 | E-mail já usado | Cadastrar com e-mail existente | Mensagem clara "e-mail já em uso"; permanece na tela |
| A1.1.3 | Senha curta | Senha com menos de 6 caracteres | Campo acusa erro; botão não avança |
| A1.1.4 | Campos obrigatórios vazios | Deixar nome da loja / e-mail / senha vazios | Erros inline nos campos; submit bloqueado |
| A1.1.5 | Nome da loja com 1 letra | Digitar 1 caractere no nome | Mensagem de validação (mínimo 2) |
| A1.1.6 | Sessão persiste | Após cadastro, dar F5 | Continua logado (não volta para login) |

### A1.2 Cadastro com Google

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A1.2.1 | Cadastro via Google | Clicar **Continuar com Google** → autorizar | Loja criada e usuário logado |
| A1.2.2 | Google com e-mail já cadastrado | Usar Google de e-mail existente | Mensagem "e-mail já em uso" |
| A1.2.3 | Cancelar popup Google | Fechar janela do Google no meio | Volta à tela sem travar; nenhum loading infinito |

### A1.3 Cadastro multi-step (se exibido)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A1.3.1 | Avançar etapas | Preencher dados → endereço → senha | Navegação entre passos com barra/indicador de progresso |
| A1.3.2 | CPF/CNPJ inválido | Digitar documento incompleto | Erro de validação no campo |
| A1.3.3 | Voltar etapa | Clicar "Voltar" | Dados preenchidos permanecem |

---

## A2. Login e Logout do Lojista
Rota: `/login`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A2.1 | Login válido | E-mail + senha corretos → **Entrar** | Redireciona para pedidos |
| A2.2 | Senha incorreta | Senha errada | Mensagem "credenciais inválidas"; campos preservados |
| A2.3 | E-mail inexistente | E-mail não cadastrado | Mesma mensagem genérica (não revela se existe) |
| A2.4 | Campos vazios | Submeter vazio | Validação inline; submit bloqueado |
| A2.5 | Muitas tentativas | Errar senha várias vezes seguidas | Mensagem de bloqueio temporário / aguardar |
| A2.6 | Login com Google | **Entrar com Google** com conta cadastrada | Login OK |
| A2.7 | Google não cadastrado | Google de conta sem loja | Mensagem "e-mail não registrado" |
| A2.8 | Logout | Menu → Sair | Volta ao login; token limpo |
| A2.9 | Voltar após logout | Após sair, clicar "voltar" do navegador | Não acessa dashboard; redireciona para login |
| A2.10 | Rota protegida sem login | Abrir URL do dashboard sem sessão | Redireciona para `/login` |
| A2.11 | Link "Criar conta" / "Esqueci" | Clicar nos links da tela | Navega corretamente |

---

## A3. Layout, Navegação e Tema

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A3.1 | Menu lateral | Percorrer todos os itens do menu | Cada item abre a tela correta e marca item ativo |
| A3.2 | Itens ocultos por papel | Logar como ASSISTANT | Itens sem permissão (Usuários, WhatsApp, Analytics) não aparecem ou ficam bloqueados |
| A3.3 | Logo e cores da loja | Aplicar tema em Configurações | Header/branding refletem cores e logo |
| A3.4 | Menu responsivo | Reduzir janela / abrir no celular | Menu vira hambúrguer; navegação funciona |
| A3.5 | Skeleton ao carregar | Abrir telas com lista | Skeleton/placeholder aparece antes dos dados |
| A3.6 | Estado ativo/scroll | Rolar listas longas | Sem travamentos; cabeçalho fixo se houver |

---

## A4. Pedidos
Rotas: `/orders`, `/orders/[id]`, `/all-orders`

### A4.1 Listagem

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A4.1.1 | Ver pedidos ativos | Abrir Pedidos | Lista com status, cliente, horário, entregador |
| A4.1.2 | Colunas por status | Observar agrupamento (PREPARANDO, EM ROTA, etc.) | Pedidos nas colunas/estados corretos |
| A4.1.3 | Todos os pedidos | Abrir "Todos os pedidos" | Histórico com paginação/scroll infinito |
| A4.1.4 | Filtro/busca | Filtrar por status, entregador ou texto | Lista filtra corretamente |
| A4.1.5 | Indicador de atraso | Pedido acima do tempo | Destaque visual (amarelo/vermelho) |
| A4.1.6 | Contadores | Conferir badges de contagem | Números batem com a lista |

### A4.2 Criar pedido

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A4.2.1 | Novo pedido válido | Selecionar cliente + forma de pagamento → Salvar | Pedido criado, aparece em PREPARANDO; código de entrega exibido |
| A4.2.2 | Sem cliente | Salvar sem escolher cliente | Validação impede |
| A4.2.3 | Cliente novo no fluxo | Criar cliente durante criação do pedido | Cliente criado e vinculado |
| A4.2.4 | Pedido prioritário | Marcar prioridade + tempo máximo | Selo de prioridade no card |
| A4.2.5 | Endereço de entrega | Escolher endereço do cliente | Endereço exibido no pedido |
| A4.2.6 | Valor em dinheiro | Informar valor a receber (cash) | Valor salvo e exibido |
| A4.2.7 | Limite do plano atingido | Criar além do limite | Mensagem de limite/upgrade (não cria) |

### A4.3 Editar / detalhe

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A4.3.1 | Abrir detalhe | Clicar em um pedido | Tela de detalhe com histórico/linha do tempo |
| A4.3.2 | Editar observação | Alterar nota → Salvar | Nota atualizada |
| A4.3.3 | Nota longa demais | Digitar acima do limite | Contador/validação impede excedente |
| A4.3.4 | Alternar prioridade | Toggle de prioridade | Reflete no card imediatamente |
| A4.3.5 | Corrigir endereço | Trocar endereço de entrega | Atualizado no detalhe |
| A4.3.6 | Editar entregue | Abrir pedido já entregue | Campos bloqueados / edição impedida |

### A4.4 Cancelar / deletar

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A4.4.1 | Cancelar com motivo | Cancelar → escolher motivo | Pedido marcado como cancelado |
| A4.4.2 | ASSISTANT cancela | Como ASSISTANT, tentar cancelar | Ação indisponível/bloqueada |
| A4.4.3 | Deletar sem permissão | Papel sem permissão de deletar | Botão ausente ou erro amigável |
| A4.4.4 | Deletar com permissão | OWNER deleta | Pedido some da lista após confirmação |

---

## A5. Atribuição e Rotas
Rotas: `/routes`, `/routes/[id]`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A5.1 | Atribuir a entregador | No pedido, escolher entregador → Atribuir | Pedido vira ATRIBUÍDO; rota criada |
| A5.2 | Atribuir a entregador offline | Escolher entregador offline | Mensagem impedindo / aviso |
| A5.3 | Atribuição em lote | Selecionar vários pedidos → Atribuir | Todos entram na mesma rota |
| A5.4 | Listar rotas | Abrir Rotas | Lista paginada com entregador, status, nº pedidos |
| A5.5 | Filtrar rotas | Por entregador e período | Lista filtra |
| A5.6 | Detalhe da rota | Abrir rota | Pedidos ordenados + mapa com pins |
| A5.7 | Editar rota | Adicionar pedidos a rota CRIADA | Pedidos entram na rota |
| A5.8 | Editar rota finalizada | Tentar editar rota concluída | Edição bloqueada |
| A5.9 | Forçar status | Forçar finalização (papel com permissão) | Status muda; sem permissão → bloqueado |
| A5.10 | Exportar CSV | Exportar (com feature ativa) | Arquivo baixado |
| A5.11 | Exportar sem feature | Loja sem feature de export | Opção ausente/bloqueada |
| A5.12 | Deletar rota | Deletar (OWNER) | Rota removida após confirmação |

---

## A6. Clientes
Rotas: `/customers`, `/customers/new`, `/customers/[id]`, `/customers/[id]/edit`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A6.1 | Criar cliente | Nome + telefone + 1 endereço → Salvar | Cliente criado; aparece na lista |
| A6.2 | Sem endereço | Salvar sem endereço | Validação exige ao menos 1 |
| A6.3 | Telefone curto | Telefone incompleto | Validação impede |
| A6.4 | Telefone duplicado | Cadastrar telefone existente | Reaproveita cliente existente (não duplica) / aviso |
| A6.5 | Listar/paginar | Rolar lista | Paginação/scroll funciona (15/página) |
| A6.6 | Buscar por nome | Digitar nome na busca | Filtra por nome |
| A6.7 | Buscar por telefone | Digitar telefone | Filtra por telefone |
| A6.8 | Ordenar recentes | Ordenar por mais novos | Ordem correta |
| A6.9 | Ver detalhe | Abrir cliente | Dados + endereços + resumo de pedidos |
| A6.10 | Editar | Alterar dados/endereços → Salvar | Atualizado |
| A6.11 | Adicionar endereço | Novo endereço no cliente | Endereço listado |
| A6.12 | Remover endereço | Excluir endereço | Some da lista |
| A6.13 | Histórico de endereços | Abrir histórico | Registro de alterações |
| A6.14 | Deletar cliente | Excluir | Some da lista (pedidos preservados) |
| A6.15 | Deletar em lote | Selecionar vários → excluir | Removidos |
| A6.16 | ASSISTANT sem excluir | Como ASSISTANT | Botão excluir ausente/bloqueado |

---

## A7. Entregadores
Rotas: `/deliverers`, `/deliverers/[id]`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A7.1 | Listar entregadores | Abrir Entregadores | Lista com status (disponível/em rota/offline) |
| A7.2 | Criar entregador | Nome + usuário + senha → Salvar | Criado |
| A7.3 | Usuário duplicado | Username já usado na loja | Mensagem de duplicado |
| A7.4 | Username inválido | Caracteres proibidos / < 3 chars | Validação impede |
| A7.5 | Senha curta | Senha < 6 | Validação impede |
| A7.6 | Editar entregador | Alterar dados → Salvar | Atualizado |
| A7.7 | Ativar/desativar | Toggle ativo | Estado muda |
| A7.8 | Ativar acima do limite | Ativar além do plano | Mensagem de limite |
| A7.9 | Forçar offline | Botão forçar offline | Entregador vai a offline |
| A7.10 | Ver invite/código | Ver código de convite da loja | Código exibido/copiável |
| A7.11 | Histórico do entregador | Abrir detalhe | Últimas entregas + status + avaliação média |
| A7.12 | ASSISTANT sem gerenciar | Como ASSISTANT | Ações de criar/editar/forçar bloqueadas |

---

## A8. Rastreamento ao Vivo (Operador)
Rotas: `/tracking/order/[orderId]`, `/tracking/deliverer/[delivererId]`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A8.1 | Mapa do pedido | Abrir rastreio de um pedido em rota | Mapa com posição do entregador e destino |
| A8.2 | Atualização ao vivo | Entregador se movendo | Marcador atualiza sem recarregar página |
| A8.3 | Rastreio do entregador | Abrir por entregador | Rota/percurso do entregador no mapa |
| A8.4 | Papel sem permissão | ASSISTANT tenta rastrear | Acesso bloqueado |

---

## A9. Chat com Entregador

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A9.1 | Badge de não lidas | Nova mensagem do entregador | Contador de não lidas aparece |
| A9.2 | Abrir conversa | Abrir chat do pedido | Histórico de mensagens carrega |
| A9.3 | Enviar mensagem | Digitar + enviar | Mensagem aparece na hora |
| A9.4 | Mensagem vazia | Enviar vazio | Botão desabilitado/bloqueado |
| A9.5 | Mensagem longa | Acima do limite | Contador/validação impede |
| A9.6 | Pedido sem entregador | Tentar conversar | Mensagem "sem entregador atribuído" |
| A9.7 | Marcar como lido | Abrir conversa | Badge zera |
| A9.8 | Chat desabilitado | Loja sem feature de chat | Opção de chat ausente |

---

## A10. Analytics e Relatórios
Rota: `/analytics`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A10.1 | Abrir analytics | Como OWNER/MANAGER | Dashboards e gráficos carregam |
| A10.2 | Série temporal | Alternar dia/mês | Gráfico atualiza escala |
| A10.3 | Pedidos por horário | Ver distribuição por meia-hora | Gráfico coerente |
| A10.4 | Por status | Ver distribuição por status | Números somam o total |
| A10.5 | Cancelamentos | Ver por motivo/período | Filtro de período funciona |
| A10.6 | Por entregador | Contagens por entregador | Ranking/lista correta |
| A10.7 | Durações | Preparo/rota/total | Métricas exibidas |
| A10.8 | Período vazio | Escolher período sem dados | Estado vazio amigável (sem quebra) |
| A10.9 | ASSISTANT sem acesso | Como ASSISTANT | Menu ausente / acesso bloqueado |

---

## A11. Metas e Gamificação
Rota: `/goals`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A11.1 | Ver metas | Abrir Metas | Entregadores com progresso |
| A11.2 | Criar/editar meta | Definir tipo, alvo, período → Salvar | Meta salva e progresso exibido |
| A11.3 | Alvo inválido | Alvo 0/negativo | Validação impede |
| A11.4 | Deletar meta | Excluir | Some da lista |
| A11.5 | Config de conquistas | Ajustar metas de conquistas | Config salva |
| A11.6 | Calendário/conquistas | Ver calendário da loja | Streaks/dias exibidos |

---

## A12. Garantias
Rota: `/garantias`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A12.1 | Config / draft | Editar perguntas do draft → Salvar | Draft salvo |
| A12.2 | Publicar | Publicar versão | Nova versão publicada |
| A12.3 | Pergunta sem título | Salvar pergunta sem label | Validação impede |
| A12.4 | Feature off | Loja sem feature de garantias | Tela/opção ausente |
| A12.5 | Listar standings | Ver lista | Status por cliente |
| A12.6 | Criar link | Gerar link/QR para cliente | QR + URL exibidos |
| A12.7 | Ver QR | Abrir QR do cliente | QR e link públicos |
| A12.8 | Histórico | Abrir histórico do cliente | Aceites anteriores |

---

## A13. Anúncios
Rota: `/announcements`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A13.1 | Listar | Abrir Anúncios | Lista de anúncios |
| A13.2 | Criar | Título + corpo → Salvar | Criado |
| A13.3 | Com cores | Definir cores de destaque/fundo/texto | Preview reflete cores |
| A13.4 | Com expiração | Definir data de expiração | Data salva |
| A13.5 | Editar | Alterar → Salvar | Atualizado |
| A13.6 | Deletar | Excluir | Removido |
| A13.7 | Limites de texto | Exceder limite de título/corpo | Validação impede |

---

## A14. WhatsApp
Rota: `/whatsapp`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A14.1 | Ver status | Abrir WhatsApp | Estado de conexão exibido |
| A14.2 | Conectar | Clicar conectar | QR code aparece; atualiza durante espera |
| A14.3 | Desconectar | Clicar desconectar | Volta a desconectado |
| A14.4 | ASSISTANT/MANAGER sem acesso | Papel sem permissão | Menu ausente/bloqueado (só OWNER) |

---

## A15. Configurações da Loja
Rota: `/settings`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A15.1 | Tema — cores | Alterar cores (#RRGGBB) → Salvar | Tema aplicado no painel |
| A15.2 | Upload de logo | Enviar imagem | Logo exibida; preview atualiza |
| A15.3 | Remover logo | Remover | Volta ao padrão |
| A15.4 | Cor inválida | Cor fora do formato | Validação impede |
| A15.5 | Config operacionais | Ajustar máx. pedidos por rota | Salvo (respeita faixa 1–20) |
| A15.6 | Valor fora da faixa | Digitar 0 ou 21 | Validação impede |
| A15.7 | Toggles | Ligar/desligar exigir foto, código de coleta etc. | Estados persistem após reload |
| A15.8 | Thresholds de atraso | Ajustar minutos de alerta | Salvo |
| A15.9 | Endereço da loja | Definir endereço/coordenadas no mapa | Salvo |
| A15.10 | Billing/plano | Ver aba de plano | Status, trial e uso vs. limites |
| A15.11 | ASSISTANT só leitura | Como ASSISTANT | Campos bloqueados / salvar indisponível |

---

## A16. Equipe / Usuários
Rota: `/users`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A16.1 | Listar usuários (OWNER) | Abrir Usuários | Lista da equipe |
| A16.2 | Não-OWNER acessa | MANAGER/ASSISTANT | Menu ausente/bloqueado |
| A16.3 | Criar MANAGER | Criar com papel MANAGER | Criado |
| A16.4 | Criar ASSISTANT | Criar com papel ASSISTANT | Criado |
| A16.5 | E-mail/username duplicado | Reusar existente | Mensagem de duplicado |
| A16.6 | Deletar usuário | Excluir | Removido |
| A16.7 | Auto-exclusão | Tentar deletar a si mesmo | Bloqueado com aviso |
| A16.8 | Reset de senha | Resetar senha de um usuário | Confirmação; alvo é deslogado nas sessões |

---

## A17. Perfil e Sessões
Rota: `/perfil`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A17.1 | Alterar própria senha | Senha atual + nova (6+) → Salvar | Sucesso; segue logado |
| A17.2 | Senha atual errada | Senha atual incorreta | Mensagem de erro |
| A17.3 | Nova senha curta | Nova < 6 | Validação impede |
| A17.4 | Ver sessões | Abrir sessões | Lista dos últimos 30 dias, "atual" destacada |
| A17.5 | Revogar sessão | Revogar outra sessão | Sessão sai da lista/perde acesso |
| A17.6 | Multi-device | Logar em 2 navegadores | Ambas as sessões listadas |
| A17.7 | Logout em um device | Sair em um | Outro segue ativo |

---

## A18. Super Admin
Rotas: `/super-admin`, `/super-admin/stores`, `/super-admin/plans`, `/super-admin/analytics`, `/super-admin/scopes`, `/super-admin/profile`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A18.1 | Login super admin | Entrar com credencial de admin | Acessa painel super admin |
| A18.2 | Lojista não acessa | Logar como OWNER e abrir `/super-admin` | Bloqueado/redirecionado |
| A18.3 | Listar lojas | Abrir Lojas | Lista com contagens |
| A18.4 | Detalhe da loja | Abrir uma loja | Plano, features, uso |
| A18.5 | Criar loja | Nova loja | Criada com trial |
| A18.6 | Renomear loja | Alterar nome | Atualizado |
| A18.7 | Toggle de features | Ligar/desligar feature | Reflete no detalhe |
| A18.8 | Gerenciar usuários da loja | CRUD de usuários | Funciona |
| A18.9 | Billing / pagamento | Ajustar plano/registrar pagamento | Atualizado |
| A18.10 | Planos | Criar/editar/excluir plano | Funciona; plano em uso não é excluído |
| A18.11 | Scopes | Editar scopes por papel | Salvo |
| A18.12 | Analytics global | Abrir analytics | Stats por loja |

---

## A19. Páginas Públicas (Rastreio e Garantia)
Rotas: `/tracking/[token]`, `/rastreio/[token]`, `/g/[token]` (sem login)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| A19.1 | Abrir rastreio válido | Acessar link + código correto | Status do pedido + mapa do entregador |
| A19.2 | Código inválido | Código de rastreio errado | Mensagem de acesso negado |
| A19.3 | Link expirado | Abrir após expiração | Mensagem de link expirado |
| A19.4 | Avaliar entrega | Dar nota (1–5) + comentário | Avaliação registrada; agradecimento exibido |
| A19.5 | Avaliar de novo | Reenviar avaliação | Bloqueado ("já avaliado") |
| A19.6 | URL PT vs EN | Abrir `/rastreio/...` e `/tracking/...` | Ambas funcionam |
| A19.7 | Garantia pública | Abrir `/g/[token]` + código | Perguntas + vídeo + tema da loja |
| A19.8 | Confirmar garantia | Responder + assinar → Confirmar | Aceite registrado |
| A19.9 | Confirmar de novo | Reabrir garantia confirmada | Bloqueado |
| A19.10 | Branding da loja | Conferir cores/logo nas páginas públicas | Tema da loja aplicado |

---

# PARTE B — App do Entregador (Mobile)

## B20. Splash e Force Update

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B20.1 | Splash inicial | Abrir o app | Splash exibida; segue para login ou pedidos |
| B20.2 | Sessão válida | Reabrir com login ativo | Entra direto (sem re-login) |
| B20.3 | Versão desatualizada | Abrir versão antiga forçada | Tela de "atualize o app" bloqueia uso |
| B20.4 | Botão atualizar | Tocar em atualizar | Abre a loja de apps |

---

## B21. Login do Entregador
Tela: `login_screen.dart`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B21.1 | Login válido | Código da loja + usuário + senha → Entrar | App abre na lista de pedidos |
| B21.2 | Código de loja inválido | Código inexistente | Mensagem de erro clara |
| B21.3 | Usuário/senha errados | Credenciais incorretas | Mensagem de erro |
| B21.4 | Muitas tentativas | Errar várias vezes | Aviso de bloqueio temporário |
| B21.5 | Resolver loja | Digitar código válido | Nome/dados da loja aparecem antes de logar |
| B21.6 | Campos vazios | Entrar vazio | Validação impede |
| B21.7 | Mostrar/ocultar senha | Tocar no olho | Alterna visibilidade |

---

## B22. Termos de Uso e Onboarding
Telas: `terms_screen.dart`, `onboarding/setup_screen.dart`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B22.1 | Ver termos | Primeiro login | Termos exibidos com versão |
| B22.2 | Aceitar termos | Tocar aceitar | Avança para o app |
| B22.3 | Recusar/voltar | Não aceitar | Não avança |
| B22.4 | Onboarding inicial | Fluxo de setup no 1º acesso | Passos exibidos; conclui e não repete |
| B22.5 | Tour de troca | Ver tour de "trocar de rota/pedido" | Aparece uma vez; não repete após visto |
| B22.6 | Definir nome | Preencher nome no onboarding | Salvo; onboarding não reaparece |

---

## B23. Lista de Pedidos e Disponibilidade
Telas: `orders_screen.dart`, `order_detail_screen.dart`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B23.1 | Ficar disponível | Alternar status para "Disponível" | Status atualiza; passa a receber pedidos |
| B23.2 | Ir para offline | Alternar para "Offline" sem pedidos | Fica offline |
| B23.3 | Offline com pedidos ativos | Tentar offline com pedido em rota | Bloqueado com aviso |
| B23.4 | Ver pedidos disponíveis | Aba de pedidos PREPARANDO | Lista de pedidos para pegar |
| B23.5 | Reservar pedido | Tocar reservar | Reserva por tempo limitado (contador) |
| B23.6 | Reserva expira | Aguardar o tempo | Reserva some sozinha |
| B23.7 | Pedido já pego por outro | Tentar reservar reservado | Aviso de indisponível |
| B23.8 | Reivindicar (claim) | Selecionar pedidos → pegar | Pedidos entram na sua rota |
| B23.9 | Ver detalhe do pedido | Abrir pedido | Cliente, endereço, itens, pagamento, código |
| B23.10 | Pull-to-refresh | Puxar para atualizar | Lista recarrega |
| B23.11 | Estado vazio | Sem pedidos | Mensagem/ilustração de vazio |

---

## B24. Seleção e Planejamento de Rota
Telas: `order_selection_screen.dart`, `route_planning_screen.dart`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B24.1 | Selecionar múltiplos | Marcar vários pedidos | Contador de selecionados atualiza |
| B24.2 | Montar rota | Confirmar seleção | Rota criada com os pedidos |
| B24.3 | Reordenar paradas | Arrastar para reordenar | Nova ordem persiste |
| B24.4 | Ver rota no mapa | Abrir planejamento | Paradas plotadas no mapa |
| B24.5 | Adicionar à rota existente | Incluir novos pedidos | Entram e reordenam |
| B24.6 | Cancelar rota não iniciada | Cancelar rota criada | Pedidos voltam para disponíveis |
| B24.7 | Cancelar rota iniciada | Tentar cancelar após iniciar | Bloqueado |

---

## B25. Coleta (Pickup)
Tela: `pickup_confirmation_screen.dart`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B25.1 | Confirmar coleta com código | Digitar código correto | Pedido vai para EM ROTA |
| B25.2 | Código incorreto | Digitar errado | Erro; não confirma |
| B25.3 | Coleta em lote (rota) | Confirmar coleta de todos | Todos passam a EM ROTA; 1º para saída |
| B25.4 | Sem exigir código | Loja com código desligado | Coleta sem digitar código |
| B25.5 | Iniciar rota | Iniciar após coleta | 1º pedido vira "saiu para entrega" |
| B25.6 | Reintento | Confirmar de novo já coletado | Sem erro/idempotente |

---

## B26. Entrega
Tela: `delivery_screen.dart` *(arquivo com alteração pendente — testar com atenção)*

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B26.1 | Entrega válida | Confirmar entrega + código | Pedido ENTREGUE |
| B26.2 | Foto de prova | Anexar foto(s) | Fotos aparecem antes de confirmar |
| B26.3 | Foto obrigatória | Loja exige foto, tentar sem | Bloqueado até anexar |
| B26.4 | Limite de fotos | Exceder máx. de fotos | Impede adicionar além do limite |
| B26.5 | Múltiplos pagamentos | Registrar dinheiro + pix | Ambos registrados |
| B26.6 | Código de entrega errado | Digitar código incorreto | Erro; não confirma |
| B26.7 | Proximidade exigida | Loja exige proximidade e está longe | Aviso de "aproxime-se" |
| B26.8 | Ordem de entrega forçada | Entregar fora de ordem | Bloqueado/avisa a ordem correta |
| B26.9 | Nota do entregador | Adicionar observação | Salva no pedido |
| B26.10 | Recebeu dinheiro | Marcar "recebi em dinheiro" | Flag registrada |
| B26.11 | Retornar à fila | Devolver pedido | Volta para disponíveis/PREPARANDO |
| B26.12 | Cancelar em trânsito | Cancelar com motivo | Pedido cancelado com motivo |
| B26.13 | Cancelar "outro" sem nota | Motivo OUTRO sem texto | Aceito (nota opcional) |
| B26.14 | Upload lento/offline | Confirmar com internet ruim | Feedback de progresso; não trava sem retorno |

---

## B27. Cash / Prestação de Contas
Tela: `cash_handover_screen.dart`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B27.1 | Ver total a repassar | Abrir tela de acerto | Soma dos valores em dinheiro coletados |
| B27.2 | Confirmar repasse | Confirmar entrega do dinheiro | Estado atualizado/zerado |
| B27.3 | Detalhe por pedido | Ver pedidos que compõem o total | Lista coerente com entregas em dinheiro |

---

## B28. Chat com Operador (App)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B28.1 | Ver mensagens | Abrir chat do pedido | Histórico carrega |
| B28.2 | Enviar mensagem | Digitar + enviar | Aparece na hora; operador recebe |
| B28.3 | Receber em tempo real | Operador envia | Notificação/mensagem aparece sem sair da tela |
| B28.4 | Marcar como lido | Abrir conversa | Não lidas zeram |
| B28.5 | Sem permissão | Pedido de outro entregador | Chat indisponível |

---

## B29. Anúncios (App)
Tela: `announcements/`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B29.1 | Ver anúncios ativos | Abrir anúncios | Só ativos, não expirados e não lidos |
| B29.2 | Marcar como lido | Abrir/fechar anúncio | Não reaparece |
| B29.3 | Expirado não aparece | Anúncio com data passada | Não é exibido |
| B29.4 | Cores personalizadas | Anúncio com cores | Renderiza com as cores definidas |

---

## B30. Analytics e Gamificação (App)
Telas: `analytics_screen.dart`, `gamification_screen.dart`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B30.1 | Ver entregas de hoje | Abrir analytics | Total do dia + resumo do mês |
| B30.2 | Filtrar por mês | Escolher mês anterior | Dados do mês selecionado |
| B30.3 | Conquistas/streaks | Abrir gamificação | Streaks, stats e calendário |
| B30.4 | Detalhe do dia | Tocar em um dia | Detalhamento do dia |
| B30.5 | Sem dados | Novo entregador | Estado vazio amigável |

---

## B31. Perfil (App)
Tela: `profile/`

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B31.1 | Ver perfil | Abrir perfil | Nome + dados da loja |
| B31.2 | Editar nome | Alterar nome → Salvar | Atualizado |
| B31.3 | Alterar senha | Senha atual + nova | Sucesso |
| B31.4 | Senha atual errada | Atual incorreta | Erro |
| B31.5 | Ver dados da loja | Abrir info da loja | Endereço/tema/config |
| B31.6 | Logout | Sair | Volta ao login; sessão encerrada |

---

## B32. Notificações Push

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| B32.1 | Permissão | 1º acesso | App pede permissão de notificação |
| B32.2 | Novo pedido | Operador atribui/avisa coleta | Push chega ao entregador |
| B32.3 | Nova mensagem | Operador envia no chat | Push de mensagem |
| B32.4 | Tocar na push | Abrir notificação | Abre a tela correta (pedido/chat) |
| B32.5 | App em background | Receber com app fechado | Notificação aparece no sistema |

---

# TRANSVERSAIS

## C33. Responsividade e Acessibilidade

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| C33.1 | Web mobile | Abrir painel no celular | Layout adapta; sem scroll horizontal |
| C33.2 | Zoom/textos grandes | Aumentar fonte do sistema | Textos não quebram/cortam |
| C33.3 | Toque em alvos pequenos | Botões no mobile | Áreas de toque adequadas |
| C33.4 | Rotação (app) | Girar o device | Layout mantém usabilidade |
| C33.5 | Contraste de tema | Tema com cores fortes | Texto continua legível |

## C34. Estados de Rede, Loading e Erros

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| C34.1 | Sem internet | Desligar rede e navegar | Mensagem clara de offline; sem tela branca |
| C34.2 | Reconexão | Religar rede | App/painel recupera dados |
| C34.3 | Loading/skeleton | Abrir telas pesadas | Indicadores enquanto carrega |
| C34.4 | Erro do servidor | Ação que falha | Toast/erro amigável; permite tentar de novo |
| C34.5 | Timeout | Rede muito lenta | Não trava indefinidamente |
| C34.6 | Sessão expirada | Ficar logado até expirar | Redireciona ao login com aviso |

## C35. Tempo Real (UI)

| # | Caso de Teste | Passos | Resultado Esperado |
|---|--------------|--------|-------------------|
| C35.1 | Pedido atualiza | Entregador muda status | Card do operador atualiza sem F5 |
| C35.2 | Nova mensagem | Chat em ambos os lados | Aparece nos dois sem recarregar |
| C35.3 | Localização | Entregador se move | Mapa do operador atualiza |
| C35.4 | Alerta de atraso | Pedido passa do tempo | Alerta visual aparece |
| C35.5 | Reserva de pedido | Entregador reserva | Operador vê o pedido como reservado |
| C35.6 | Reconexão do socket | Perder e recuperar conexão | Reconecta e volta a atualizar sozinho |

---

## Resumo

| Área | Seções | Casos aprox. |
|------|:------:|:-----------:|
| Painel Web | A1–A19 | ~150 |
| App Entregador | B20–B32 | ~90 |
| Transversais | C33–C35 | ~17 |
| **Total** | **35** | **~260** |

### Legenda de status
✅ Passou · ❌ Falhou · ⚠️ Bloqueado · ⏭️ Não aplicável

> **Nota de regressão:** `mobile/lib/features/delivery/delivery_screen.dart` tem alteração pendente no working tree — priorize a seção **B26. Entrega** nesta rodada de QA.

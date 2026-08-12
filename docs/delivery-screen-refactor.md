# Refatoração da tela de entregas (`delivery_screen.dart`)

**Data:** 2026-07-12
**Arquivo:** `mobile/lib/features/delivery/delivery_screen.dart`
**Referência de design:** `mobile/lib/features/delivery/delivey-screen.png`

Documento de aprendizado: como a tela do entregador **era** e como **ficou** após o
redesign, incluindo as decisões tomadas e as limitações de dados encontradas.

---

## Como era (antes)

- **AppBar** com título da marca + subtítulo "Entregas em rota", **seta de voltar** para
  `/orders` (a tela é aberta via `push`) e botão de refresh. Sem drawer.
- **Corpo:** `ListView.separated` de cards, **todos iguais e sempre com os mesmos botões**
  (Navegar, Entregar, Devolver à fila, Cancelar entrega). Não havia hierarquia visual entre
  a próxima parada e as demais.
- Cada card mostrava: badge numerado (sempre azul), nome + `#shortId`, endereço, badge de
  status, observações (quando havia) e a área de ações.
- Pedidos **entregues** apareciam **opacos** (`Opacity 0.55`) e sem ações.
- **Sem** card de resumo/progresso da rota.
- **Sem** menu inferior (bottom navigation). Navegação era só pelo fluxo de push/pop.
- Confirmação de entrega via botão "Entregar" → `_showDeliveryDialog` →
  `_DeliveryConfirmSheet`, com todos os checks (proximidade/GPS, código, foto, cobrança de
  valores).

## Como ficou (depois)

Estrutura em **abas** (`DeliveryScreen` virou `ConsumerStatefulWidget` guardando o índice da
aba; troca de aba é estado interno — não virou rota no `_router`).

- **AppBar enxuta:** hambúrguer que abre o `AppDrawer` (sidebar mantido) + refresh nas abas
  Rota/Mapa. O mockup não mostra AppBar, mas ela foi mantida como ponto de abertura do drawer.
- **Menu inferior** (`BottomNavigationBar`, verde na seleção): **Rota · Mapa · Histórico ·
  Perfil**.

### Aba "Rota"
1. **Cabeçalho** (`_RouteHeader`): ponto verde + "Rota em andamento" e botão outline vermelho
   "Reportar problema".
2. **Card de resumo** (`_RouteSummaryCard`): à esquerda o progresso (label + barra +
   "X de N entregas"); na mesma linha, à direita, as estatísticas **"Faltam N"** e
   **"Em rota há {tempo}"** (`_SummaryStat`, coluna compacta com ícone/rótulo/valor).
   Tempo atualizado ao vivo por `Timer.periodic` (30s).
3. **Cards de pedido** (`_DeliveryCard`) com **hierarquia** (acordeão):
   - Só a **Próxima entrega** (primeiro pedido acionável) vem **expandida**: borda verde,
     rótulo "PRÓXIMA ENTREGA" e as ações (Navegar + Confirmar entrega; Devolver/Cancelar).
   - Os demais viram **linhas compactas** clicáveis (badge, nome, endereço, status, chevron);
     tocar expande e recolhe o anterior — preservando as ações de qualquer pedido quando a
     loja **não** força a ordem da rota.
   - Entregues continuam **opacos e sem ações** (comportamento preservado).
   - Botão de confirmação é **"Confirmar entrega" normal** (sem slider "Deslize"), abrindo o
     **mesmo** `_showDeliveryDialog` → todos os checks continuam intactos.

### Aba "Mapa"
`FlutterMap` + `appTileLayer()` (`mobile/lib/core/map_tiles.dart`) com pinos numerados dos
pedidos da rota (verde = pendente, cinza = entregue). Lê o mesmo `_activeDeliveryProvider`.

### Abas "Histórico" e "Perfil"
Placeholder "Em breve" (`_ComingSoon`).

---

## Decisões e limitações de dados (aprendizados)

- **Distância / tempo por pedido e totais da rota** ("1,2 km / 4 min", "18,6 km / 42 min" no
  mockup): **não existem na API**. O `Order` (`mobile/lib/core/models/order.dart`) não tem
  distância nem ETA, e `/deliverer/orders` retorna uma lista pura, sem agregados de rota. →
  **Omitidos.** Só se mostra o que é calculável no cliente (progresso, contagem, tempo em rota).

- **"Em rota há" = tempo desde o `startedAt` da rota até agora.** A API não expõe a criação
  nem o `started_at` da rota no payload de `/deliverer/orders`. Porém o backend grava
  `routes.started_at = COALESCE(started_at, now)` **no mesmo momento** do pickup em que cada
  pedido recebe `picked_up_at`. Logo, a **retirada (`pickedUpAt`) mais antiga** entre os
  pedidos da rota é **equivalente ao `startedAt` da rota** — usada como início, sem precisar
  mudar API/modelo/cache. (Erro inicial: usar `createdAt`, que é a criação do pedido, bem
  anterior ao início da rota.)
  - Referências backend: `routes` tem `started_at` (migration `001_schema.sql:160`,
    entidade `routes/domain/entities.ts`); COALESCE no pickup em
    `routes/infrastructure/repositories/pg-route-repo.ts`.

- **Slide-to-confirm ("Deslize para confirmar"):** removido a pedido do usuário — botão de
  toque normal, mantendo **todos os checks** existentes (proximidade, código, foto, valores).

- **"Reportar problema":** **não há endpoint no backend.** Ficou como bottom sheet stub
  (`_ReportProblemSheet`, motivo + nota) que só exibe um snackbar, marcado com
  `// TODO: wire backend`.

- **Roteamento:** o app usa um `GoRouter` plano em `mobile/lib/app.dart` (sem shell route).
  Por isso as abas são estado interno da tela, e não rotas próprias.

## Verificação

- `cd mobile && flutter analyze lib` — sem erros/warnings novos (apenas `info` pré-existentes:
  `withOpacity`, `RadioListTile`, etc.).
- Validação interativa end-to-end ficou pendente: a tela exige login de entregador + uma rota
  ativa com pedidos (e usa GPS/câmera), inviável de dirigir sem uma sessão de backend.

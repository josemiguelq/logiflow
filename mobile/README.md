# LogiFlow — App do Entregador

> Gerencie suas rotas, confirme entregas e acompanhe seus pedidos — tudo em um só lugar.

O **LogiFlow Mobile** é o aplicativo para entregadores da plataforma LogiFlow. Desenvolvido em Flutter, ele conecta o entregador à operação em tempo real: recebe pedidos, organiza rotas otimizadas, abre a navegação com um toque e registra a entrega com foto e código de confirmação.

---

## O que o app oferece

**Para o entregador**

- Lista de pedidos disponíveis para aceitar, com endereço e resumo do cliente
- Planejamento de rota automático — os pedidos já chegam ordenados por posição na rota
- Navegação integrada com Google Maps, direto do card do pedido
- Confirmação de entrega com foto de comprovante e código de verificação (4 últimos dígitos do telefone)
- Histórico de entregas e status em tempo real
- Perfil editável com foto e dados pessoais

**Para a operação**

- Rastreamento de localização do entregador durante a rota
- Status de pedido atualizado automaticamente (Em rota → Saiu p/ entrega → Entregue)
- Comprovante fotográfico armazenado por pedido
- Configurações da loja sincronizadas (exigir código, exigir foto, nome da marca)

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Flutter 3 / Dart |
| Estado | Riverpod 2 |
| Navegação | go_router |
| HTTP | Dio + Cookie Manager |
| Mapas | flutter_map + Google Maps deeplink |
| Localização | geolocator |
| Armazenamento seguro | flutter_secure_storage |
| Câmera | image_picker |

---

## Como rodar

**Pré-requisitos:** Flutter SDK >= 3.3.0, Android Studio ou Xcode

```bash
# Instale as dependências
flutter pub get

# Rode em modo debug (Android ou iOS)
flutter run

# Build de produção Android
flutter build apk --release

# Build de produção iOS
flutter build ipa --release
```

> O app consome a API REST do backend LogiFlow. Configure a URL base em `lib/core/api/api_client.dart`.

---

## Estrutura do projeto

```
lib/
├── core/
│   ├── api/          # Cliente HTTP (Dio)
│   ├── auth/         # Provider de autenticação
│   ├── models/       # Order, Route
│   ├── providers/    # Configurações da loja
│   └── theme/        # Tema e cores
├── features/
│   ├── auth/         # Tela de login
│   ├── delivery/     # Tela de entregas em rota
│   ├── onboarding/   # Setup inicial
│   ├── orders/       # Seleção, detalhe, planejamento de rota
│   ├── profile/      # Perfil do entregador
│   └── tracking/     # Serviço de localização
└── widgets/          # Componentes globais (drawer, etc.)
```

---

## Licença

Proprietário — todos os direitos reservados. Uso restrito à plataforma LogiFlow.

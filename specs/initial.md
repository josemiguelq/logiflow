📄 RFC Técnico Completo — Plataforma de Entregas Urbanas

🔄 0. Exemplo de fluxo (visão simples)
Loja cria pedido
Cliente é selecionado ou criado
Pedido entra em PREPARING
Cliente recebe WhatsApp (link + código)
Loja atribui entregador (com sugestão)
Entregador confirma coleta (código)
Entregador inicia rota (multi-pedidos)
Cliente vê ON_ROUTE
Quando for sua vez → OUT_FOR_DELIVERY (com mapa)
Entregador entrega + valida código
Tira foto
Pedido finalizado (DELIVERED)

🎯 1. Visão do sistema
Sistema SaaS para gestão de entregas locais com:
multi-loja (multi-tenant via store_id)
entregadores próprios
rastreabilidade completa
controle de acesso por perfil
integração com WhatsApp via Baileys

🧱 2. Stack Tecnológica

Backend
Node.js + Fastify
Arquitetura hexagonal (modular monolith)

Banco
PostgreSQL (via Supabase)

Web
Next.js (responsivo)
Tailwind

Mobile (entregador)
Flutter (Android + iOS)

Realtime
WebSocket próprio

Fila
BullMQ + Redis

WhatsApp
Baileys

🧠 3. Arquitetura

Modelo
Modular Monolith
+ Hexagonal por módulo
+ Event-driven (parcial)

Estrutura
src/
 modules/
   orders/
   deliverers/
   customers/
   tracking/
   notifications/
   auth/

 shared/
   db/
   infra/

🗄️ 4. Modelo de Dados (PostgreSQL)

🏪 stores
id UUID PK
name
created_at

⚙️ store_settings
id UUID PK
store_id FK
max_orders_per_route INT
require_delivery_photo BOOLEAN
created_at
updated_at

👤 store_users (RBAC)
id UUID PK
store_id FK
name
email UNIQUE
password_hash
role (OWNER | MANAGER | ASSISTANT)
active BOOLEAN
created_at

🚴 deliverers
id UUID PK
store_id FK
name
email UNIQUE
username UNIQUE
password_hash
profile_image_url
status
created_at

👤 customers
id UUID PK
store_id FK
name
phone
address
complement
created_at
UNIQUE(store_id, phone)

📦 orders
id UUID PK
store_id FK
deliverer_id FK
customer_id FK

created_by_user_id FK

status
route_position

pickup_code
delivery_code

lat
lng

created_at
picked_up_at
delivered_at

📍 location_history
id BIGSERIAL PK
deliverer_id FK
order_id FK NULL

lat DOUBLE PRECISION
lng DOUBLE PRECISION

recorded_at TIMESTAMP

📸 proof_of_delivery
id UUID PK
order_id FK
photo_url
lat
lng
created_at

📲 whatsapp_sessions
id UUID PK
store_id FK
status
session_data JSONB
updated_at

📩 message_logs
id UUID PK
store_id FK
order_id FK
phone
status
attempts
created_at

📍 5. Tracking (estratégia)

Regra
Salvar localização apenas se:
distância > 50m
OU
tempo > 60s

Índices
CREATE INDEX idx_location_deliverer_time
ON location_history(deliverer_id, recorded_at DESC);

CREATE INDEX idx_location_order_time
ON location_history(order_id, recorded_at DESC);

🔐 6. Autenticação

Store User
login: email + senha
JWT com role

Deliverer
login: username + senha

🔒 7. Autorização (RBAC + Ownership)

Roles
OWNER
MANAGER
ASSISTANT

ASSISTANT
vê apenas pedidos que criou
não vê analytics
não exporta dados

Regra crítica
orders.created_by_user_id = current_user.id

📡 8. Realtime

Eventos
order_updated
deliverer_location

Regra cliente
Só recebe GPS se route_position == 1

🧭 9. Navegação

step-by-step
Google Maps via link
1 destino por vez

📲 10. WhatsApp

Fluxo
PREPARING → envia mensagem automática

Mensagem
Acompanhe sua entrega:
{link}

Código: {code}

Código
5 caracteres alfanuméricos

Sessão
1 sessão por loja
via Baileys

⚙️ 11. Dispatch

manual assistido
baseado em:
distância
carga
ETA

🧪 12. Docker (ambiente local)

docker-compose.yml
version: "3.9"

services:
 postgres:
   image: postgres:15
   container_name: delivery_postgres
   restart: always
   environment:
     POSTGRES_USER: postgres
     POSTGRES_PASSWORD: postgres
     POSTGRES_DB: delivery
   ports:
     - "5432:5432"
   volumes:
     - postgres_data:/var/lib/postgresql/data

 redis:
   image: redis:7
   container_name: delivery_redis
   ports:
     - "6379:6379"

 pgadmin:
   image: dpage/pgadmin4
   container_name: delivery_pgadmin
   restart: always
   environment:
     PGADMIN_DEFAULT_EMAIL: admin@admin.com
     PGADMIN_DEFAULT_PASSWORD: admin
   ports:
     - "5050:80"

volumes:
 postgres_data:

🔧 Uso
docker-compose up -d

Acessos
Postgres: localhost:5432
PgAdmin: http://localhost:5050
Redis: localhost:6379

⚠️ 13. Trade-offs

Decisões conscientes
❌ sem PostGIS
❌ sem microservices
❌ sem auto-dispatch

Benefícios
simplicidade
velocidade de desenvolvimento
baixo custo

🚀 14. Evolução futura

PostGIS
otimização de rotas
auto dispatch
analytics avançado
warehouse de dados

🧠 Conclusão
Sistema projetado para:
começar simples
escalar com segurança
manter rastreabilidade completa

👉 Próximo passo
Você já pode usar isso para:
gerar migrations
estruturar backend
criar endpoints
iniciar frontend
1. Notificacoes Whatsapp
Isolar completamente o uso do Baileys do restante do sistema, permitindo:
trocar implementação no futuro
testar sem WhatsApp real
manter domínio limpo
extrair para microserviço depois

🧠 2. Princípio
O domínio NÃO sabe que Baileys existe.
Regra
1 store = 1 sessão WhatsApp

Fluxo
Store conecta → QR Code → Session salva → storeId vinculado




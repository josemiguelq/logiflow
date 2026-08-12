# Princípios Gerais

Antes de ler o repositorio, busque conhecimento no obsidian
/Users/josemiguel/Obsidian/personal/

Antes de implementar qualquer funcionalidade nova, analise o impacto na arquitetura existente.

Nunca assuma que um usuário possui acesso a uma funcionalidade apenas porque ela existe no sistema.

Sempre considere:

- Autorização
- Auditoria
- Observabilidade
- Escalabilidade
- Multi-tenancy

O frontend é para o operador (usuario)
O mobile para o entregador 

## Arquitetura
Backend already has qrcode and the AWS S3 SDK. 
Frontend uses Tailwind + Radix + SWR. 

O backend deve ser Hexagonal, evitar fazer SQLs no controller.
Estou usando easypanel para fazer o deploy
Para queues estou usando BullMQ

### Deployment
Usando EasyPanel com 11G2 de RAM e 2 cores
Postgres no Render
Frontend no Vercel

## Controle de Acesso

Antes de criar uma nova funcionalidade, pergunte:

Esta funcionalidade precisa de um novo scope/permissão?

Permissoes e migrations SEMPRE em ingles

## Auditoria

Toda alteração de dados importantes deve ser auditável.

Pergunte:

Como será possível descobrir quem realizou esta ação daqui a 6 meses?

Toda entidade crítica deve registrar:

quem realizou a ação
quando realizou
qual ação foi executada
valores anteriores
valores novos

## Migrations
Alem de criar o arquivo sql, adicione no array backend/src/shared/db/migrate.ts
Faça a migration de up e down caso precise de rollback

## Funcionalidades
- Criacao de pedidos
- Rotas de entrega
- Termos de garantia
# Changelog — LogiFlow

---

## [2026-05-13]

### Frontend — Landing page (`/src/app/page.tsx`)

**Download do app mobile**
- Adicionado link de download do APK Android no hero: "Entregador? Baixe o app gratuito — sem limite de entregas"
- Adicionada seção de destaque (banner escuro) entre o hero e o social proof com botão de download, diferenciais do app e versão (v1.0.0)
- URL do APK: `https://github.com/josemiguelq/logiflow-app/releases/download/v1.0.0/app-release.apk`

**Comunicação de sem limite de entregas**
- Adicionado "Sem limite de entregas" na faixa de social proof (junto com "App nativo", "Rastreamento GPS", etc.)

---

### Frontend — Cadastro de clientes (`/src/app/(dashboard)/customers/page.tsx`)

**Google Maps Places API no lugar do Nominatim/OpenStreetMap**

Antes: autocomplete via Nominatim (`nominatim.openstreetmap.org`) e geocoding via Nominatim search.

Depois:
- Autocomplete: `POST https://places.googleapis.com/v1/places:autocomplete` (Places API New), filtrando por `route` e `street_address`, com `languageCode: pt-BR` e `regionCode: BR`
- Coordenadas ao selecionar: `GET https://places.googleapis.com/v1/{place}` com `FieldMask: location`
- Geocoding fallback (quando não há coordenadas): `GET https://maps.googleapis.com/maps/api/geocode/json`
- Chave de API via variável de ambiente `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

**Remoção do campo separado de número**

Antes: dois campos — "Rua / Avenida" + "Número".

Depois: campo único de endereço completo. O usuário digita rua e número juntos (ex: "Rua das Flores, 123") e o Google Places retorna sugestões de `street_address` com o número já incluído. O campo `number` foi removido de:
- Interface `AddressEntry`
- Função `emptyAddress`
- Interface `EditAddressEntry._orig`
- Modal de criação (`AddressList`)
- Modal de edição (view de edição inline)
- Payload enviado ao backend

Endereços existentes que tinham `number` separado são concatenados automaticamente ao carregar (`toEditEntry`).

---

### Frontend — Mapa de endereço (`/src/app/(dashboard)/customers/_address_map.tsx`)

**Google Maps no lugar do Leaflet**

Antes: Leaflet com tiles OpenStreetMap.

Depois: Google Maps JS API carregada dinamicamente (singleton via `id="gmaps-script"`), com:
- `google.maps.Map` com zoom 17, sem controles desnecessários (mapType, streetView, fullscreen)
- `google.maps.Marker` arrastável — `dragend` chama `onChange(lat, lng)`
- Clique no mapa reposiciona o marker e chama `onChange`
- Sync externo: quando o autocomplete atualiza `lat/lng`, o mapa faz `panTo` + `setPosition`

API do componente mantida idêntica: `{ lat, lng, onChange }`.

**Dependência adicionada**
- `@types/google.maps` adicionado em `devDependencies`

---

### Mobile — README (`/mobile/README.md`)

Substituído o README gerado pelo Flutter ("A new Flutter project") por documentação comercial cobrindo:
- Proposta de valor para entregador e para a operação
- Tabela de stack (Flutter, Riverpod, go_router, Dio, geolocator, flutter_map)
- Instruções de setup e build
- Estrutura de pastas

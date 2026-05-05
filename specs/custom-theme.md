📄 RFC — Theming por Loja + Feature Flags (SuperAdmin)
🎯 1. Objetivo

Permitir que cada loja:

personalize cores da plataforma
defina ícone (logo)
tenha fallback automático para tema padrão

E permitir que o superadmin:

ative/desative funcionalidades por loja
inicialmente: liberar ou não customização
🧠 2. Conceitos-chave
🎨 Theming por loja
configuração dinâmica por store_id
⚙️ Feature Flags
controle de funcionalidades por loja
⚡ Performance
carregamento rápido via:
skeleton
cache no backend
cache no navegador
🧱 3. Modelo de Dados
🎨 store_theme (NOVO)
id UUID PK
store_id FK

primary_color VARCHAR(7)
secondary_color VARCHAR(7)
accent_color VARCHAR(7)

logo_url TEXT

created_at
updated_at
⚙️ store_features (NOVO)
id UUID PK
store_id FK

custom_theme_enabled BOOLEAN DEFAULT FALSE

created_at
updated_at
👑 super_admins (simples)
id UUID PK
email
password_hash
created_at
🎨 4. Tema padrão (fallback)
Definição global
export const DEFAULT_THEME = {
  primary: "#2563EB",
  secondary: "#F9FAFB",
  accent: "#F97316"
};
Regra
Se store não tiver tema OU feature desativada → usar DEFAULT_THEME
🌐 5. Fluxo de carregamento (Frontend)
🥇 Primeira carga (importante)
1. Carrega página

👉 renderiza skeleton neutro (vanilla)

cores neutras (cinza/branco)
2. Busca config da loja
GET /store/theme
3. Aplica tema dinamicamente
document.documentElement.style.setProperty(...)
⚡ 6. Cache no navegador
Estratégia
localStorage ou sessionStorage
Recomendado
sessionStorage
Estrutura
{
  "storeId": "123",
  "theme": {
    "primary": "#2563EB"
  },
  "timestamp": 123456789
}
Regra
Se existir no cache → usar imediatamente
Depois validar com backend (background)
⚙️ 7. Backend — Endpoint
GET /store/theme
Response
{
  "theme": {
    "primary": "#2563EB",
    "secondary": "#F9FAFB",
    "accent": "#F97316",
    "logoUrl": "https://..."
  },
  "features": {
    "customThemeEnabled": true
  }
}
Lógica
Se customThemeEnabled = false → retornar DEFAULT_THEME
🎨 8. Aplicação do tema (Frontend)
CSS Variables (recomendado)
:root {
  --color-primary: #2563EB;
  --color-secondary: #F9FAFB;
  --color-accent: #F97316;
}
Aplicação dinâmica
document.documentElement.style.setProperty('--color-primary', theme.primary);
🖼️ 9. Logo da loja
Uso
header
tela de login
tracking page
Regra
Se não tiver → usar logo padrão
👑 10. Painel SuperAdmin
Objetivo

Gerenciar feature flags por loja

Funcionalidade inicial
custom_theme_enabled
Tela simples
Lista de lojas

[ ] Loja A → custom theme enabled
[ ] Loja B → disabled
Endpoint
PATCH /superadmin/store/:id/features
🔐 11. Segurança
SuperAdmin separado de StoreUser
não compartilha auth
acesso isolado
Middleware
requireSuperAdmin()
⚠️ 12. Edge Cases
🧩 Tema inválido
fallback automático
🔄 Cache desatualizado
backend sempre valida
pode usar TTL (ex: 1h)
📴 Offline
usa cache local

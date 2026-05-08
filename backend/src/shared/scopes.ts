export const SCOPES = [
  // Orders
  'orders:view',
  'orders:create',
  'orders:cancel',

  // Routes
  'routes:view',
  'routes:force_finish',

  // Customers
  'customers:view',
  'customers:create',
  'customers:edit',

  // Deliverers
  'deliverers:view',
  'deliverers:manage',

  // Users
  'users:view',
  'users:create',
  'users:delete',

  // WhatsApp
  'whatsapp:view',
  'whatsapp:connect',

  // Analytics
  'analytics:view',

  // Settings
  'settings:view',
  'settings:edit',
] as const

export type Scope = typeof SCOPES[number]

export const SCOPE_LABELS: Record<Scope, string> = {
  'orders:view':          'Pedidos — visualizar',
  'orders:create':        'Pedidos — criar',
  'orders:cancel':        'Pedidos — cancelar',
  'routes:view':          'Rotas — visualizar',
  'routes:force_finish':  'Rotas — forçar finalização',
  'customers:view':       'Clientes — visualizar',
  'customers:create':     'Clientes — criar',
  'customers:edit':       'Clientes — editar',
  'deliverers:view':      'Entregadores — visualizar',
  'deliverers:manage':    'Entregadores — gerenciar',
  'users:view':           'Usuários — visualizar',
  'users:create':         'Usuários — criar',
  'users:delete':         'Usuários — remover',
  'whatsapp:view':        'WhatsApp — visualizar',
  'whatsapp:connect':     'WhatsApp — conectar/desconectar',
  'analytics:view':       'Analítico — visualizar',
  'settings:view':        'Configurações — visualizar',
  'settings:edit':        'Configurações — editar',
}

export const SCOPE_GROUPS: { label: string; scopes: Scope[] }[] = [
  { label: 'Pedidos',        scopes: ['orders:view', 'orders:create', 'orders:cancel'] },
  { label: 'Rotas',          scopes: ['routes:view', 'routes:force_finish'] },
  { label: 'Clientes',       scopes: ['customers:view', 'customers:create', 'customers:edit'] },
  { label: 'Entregadores',   scopes: ['deliverers:view', 'deliverers:manage'] },
  { label: 'Usuários',       scopes: ['users:view', 'users:create', 'users:delete'] },
  { label: 'WhatsApp',       scopes: ['whatsapp:view', 'whatsapp:connect'] },
  { label: 'Analítico',      scopes: ['analytics:view'] },
  { label: 'Configurações',  scopes: ['settings:view', 'settings:edit'] },
]

export const DEFAULT_ROLE_SCOPES: Record<string, Scope[]> = {
  OWNER: [...SCOPES],
  MANAGER: SCOPES.filter(s =>
    !['users:view', 'users:create', 'users:delete'].includes(s)
  ),
  ASSISTANT: [
    'orders:view', 'orders:create',
    'routes:view',
    'customers:view', 'customers:create', 'customers:edit',
    'deliverers:view',
    'settings:view',
  ],
}

export const SCOPES = [
  // Orders
  'orders:view',
  'orders:create',
  'orders:cancel',
  'orders:delete',

  // Routes
  'routes:view',
  'routes:force_finish',
  'routes:export',
  'routes:delete',

  // Customers
  'customers:view',
  'customers:create',
  'customers:edit',
  'customers:delete',

  // Deliverers
  'deliverers:view',
  'deliverers:manage',
  'deliverers:force_offline',

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

  // Goals
  'goals:view',
  'goals:manage',
] as const

export type Scope = typeof SCOPES[number]

export const SCOPE_LABELS: Record<Scope, string> = {
  'orders:view':          'Pedidos — visualizar',
  'orders:create':        'Pedidos — criar',
  'orders:cancel':        'Pedidos — cancelar',
  'orders:delete':        'Pedidos — excluir permanentemente',
  'routes:view':          'Rotas — visualizar',
  'routes:force_finish':  'Rotas — forçar finalização',
  'routes:export':        'Rotas — exportar CSV',
  'routes:delete':        'Rotas — excluir rota e todos os pedidos',
  'customers:view':       'Clientes — visualizar',
  'customers:create':     'Clientes — criar',
  'customers:edit':       'Clientes — editar',
  'customers:delete':     'Clientes — excluir',
  'deliverers:view':          'Entregadores — visualizar',
  'deliverers:manage':        'Entregadores — gerenciar',
  'deliverers:force_offline': 'Entregadores — forçar offline',
  'users:view':           'Usuários — visualizar',
  'users:create':         'Usuários — criar',
  'users:delete':         'Usuários — remover',
  'whatsapp:view':        'WhatsApp — visualizar',
  'whatsapp:connect':     'WhatsApp — conectar/desconectar',
  'analytics:view':       'Analítico — visualizar',
  'settings:view':        'Configurações — visualizar',
  'settings:edit':        'Configurações — editar',
  'goals:view':           'Metas — visualizar',
  'goals:manage':         'Metas — criar e editar',
}

export const SCOPE_GROUPS: { label: string; scopes: Scope[] }[] = [
  { label: 'Pedidos',        scopes: ['orders:view', 'orders:create', 'orders:cancel', 'orders:delete'] },
  { label: 'Rotas',          scopes: ['routes:view', 'routes:force_finish', 'routes:export', 'routes:delete'] },
  { label: 'Clientes',       scopes: ['customers:view', 'customers:create', 'customers:edit', 'customers:delete'] },
  { label: 'Entregadores',   scopes: ['deliverers:view', 'deliverers:manage', 'deliverers:force_offline'] },
  { label: 'Usuários',       scopes: ['users:view', 'users:create', 'users:delete'] },
  { label: 'WhatsApp',       scopes: ['whatsapp:view', 'whatsapp:connect'] },
  { label: 'Analítico',      scopes: ['analytics:view'] },
  { label: 'Configurações',  scopes: ['settings:view', 'settings:edit'] },
  { label: 'Metas',          scopes: ['goals:view', 'goals:manage'] },
]

export const DEFAULT_ROLE_SCOPES: Record<string, Scope[]> = {
  OWNER: [...SCOPES],
  MANAGER: SCOPES.filter(s =>
    !['users:view', 'users:create', 'users:delete', 'whatsapp:view', 'whatsapp:connect',
      'routes:delete', 'orders:delete', 'customers:delete'].includes(s)
  ),
  ASSISTANT: [
    'orders:view', 'orders:create',
    'routes:view',
    'customers:view', 'customers:create', 'customers:edit',
    'deliverers:view',
    'settings:view',
    'goals:view',
  ],
}

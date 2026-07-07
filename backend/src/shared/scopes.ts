export const SCOPES = [
  // Orders
  'orders:view',
  'orders:view_all',
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
  'deliverers:track',
  'deliverers:delete',

  // Users
  'users:view',
  'users:create',
  'users:delete',
  'users:reset_password',

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

  // Sessions
  'sessions:view_all',

  // Announcements
  'announcements:manage',

  // Garantias
  'garantias:view',
  'garantias:manage',
] as const

export type Scope = typeof SCOPES[number]

export const SCOPE_LABELS: Record<Scope, string> = {
  'orders:view':          'Pedidos — visualizar',
  'orders:view_all':      'Pedidos — ver todos da loja (não só os próprios)',
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
  'deliverers:track':         'Entregadores — rastrear localização',
  'deliverers:delete':        'Entregadores — excluir',
  'users:view':           'Usuários — visualizar',
  'users:create':         'Usuários — criar',
  'users:delete':         'Usuários — remover',
  'users:reset_password': 'Usuários — redefinir senha',
  'whatsapp:view':        'WhatsApp — visualizar',
  'whatsapp:connect':     'WhatsApp — conectar/desconectar',
  'analytics:view':       'Analítico — visualizar',
  'settings:view':        'Configurações — visualizar',
  'settings:edit':        'Configurações — editar',
  'goals:view':           'Metas — visualizar',
  'goals:manage':         'Metas — criar e editar',
  'sessions:view_all':    'Sessões — ver os acessos de todos os usuários',
  'announcements:manage': 'Comunicados — criar e enviar para entregadores',

  'garantias:view':   'Garantias — visualizar',
  'garantias:manage': 'Garantias — gerenciar',
}

export const SCOPE_GROUPS: { label: string; scopes: Scope[] }[] = [
  { label: 'Pedidos',        scopes: ['orders:view', 'orders:view_all', 'orders:create', 'orders:cancel', 'orders:delete'] },
  { label: 'Rotas',          scopes: ['routes:view', 'routes:force_finish', 'routes:export', 'routes:delete'] },
  { label: 'Clientes',       scopes: ['customers:view', 'customers:create', 'customers:edit', 'customers:delete'] },
  { label: 'Entregadores',   scopes: ['deliverers:view', 'deliverers:manage', 'deliverers:force_offline', 'deliverers:track', 'deliverers:delete'] },
  { label: 'Usuários',       scopes: ['users:view', 'users:create', 'users:delete', 'users:reset_password'] },
  { label: 'WhatsApp',       scopes: ['whatsapp:view', 'whatsapp:connect'] },
  { label: 'Analítico',      scopes: ['analytics:view'] },
  { label: 'Configurações',  scopes: ['settings:view', 'settings:edit'] },
  { label: 'Metas',          scopes: ['goals:view', 'goals:manage'] },
  { label: 'Sessões',        scopes: ['sessions:view_all'] },
  { label: 'Comunicados',    scopes: ['announcements:manage'] },
  { label: 'Garantias',      scopes: ['garantias:view', 'garantias:manage'] },
]

export const DEFAULT_ROLE_SCOPES: Record<string, Scope[]> = {
  OWNER: [...SCOPES],
  MANAGER: SCOPES.filter(s =>
    !['users:view', 'users:create', 'users:delete', 'users:reset_password',
      'whatsapp:view', 'whatsapp:connect',
      'routes:delete', 'orders:delete', 'customers:delete', 'deliverers:delete', 'sessions:view_all'].includes(s)
  ),
  ASSISTANT: [
    'orders:view', 'orders:view_all', 'orders:create',
    'routes:view',
    'customers:view', 'customers:create', 'customers:edit',
    'deliverers:view',
    'settings:view',
    'goals:view',
    'garantias:view',
    'garantias:manage',
  ],
}

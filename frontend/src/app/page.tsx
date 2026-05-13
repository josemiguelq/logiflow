import Link from 'next/link'

// ─── data ────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: '📦',
    title: 'Gestão de pedidos',
    desc: 'Crie, atribua e acompanhe todos os pedidos da sua loja em tempo real, com status atualizado automaticamente a cada etapa.',
  },
  {
    icon: '🗺️',
    title: 'Rastreamento GPS ao vivo',
    desc: 'Veja a localização exata de cada entregador no mapa enquanto ele faz a rota — sem precisar ligar ou mandar mensagem.',
  },
  {
    icon: '🛣️',
    title: 'Rotas inteligentes',
    desc: 'O entregador organiza a ordem de entrega no app e confirma a rota antes de sair, reduzindo desvios e atrasos.',
  },
  {
    icon: '📸',
    title: 'Confirmação com foto e código',
    desc: 'Exija foto da entrega e código de 4 dígitos do destinatário para garantir que o pedido chegou ao lugar certo.',
  },
  {
    icon: '💬',
    title: 'Notificações via WhatsApp',
    desc: 'Avise automaticamente o cliente quando o pedido sair para entrega e quando for entregue — sem digitação manual.',
  },
  {
    icon: '🔗',
    title: 'Link de rastreamento para o cliente',
    desc: 'Cada pedido gera um link único. O cliente acompanha a entrega em tempo real direto no navegador, sem instalar nada.',
  },
  {
    icon: '📊',
    title: 'Métricas e relatórios',
    desc: 'Histórico completo de entregas, tempo médio por rota, avaliações de entregadores e relatórios exportáveis em CSV.',
  },
  {
    icon: '⭐',
    title: 'Avaliação de entregadores',
    desc: 'Clientes avaliam a entrega com até 5 estrelas diretamente pelo link de rastreamento. Monitore o desempenho da sua equipe.',
  },
  {
    icon: '🎨',
    title: 'Personalização de marca',
    desc: 'Coloque a logo e as cores da sua loja no app do entregador e na página de rastreamento do cliente.',
  },
]

const BENEFITS = [
  {
    icon: '👁️',
    title: 'Mais visibilidade para o cliente',
    desc: 'O link de rastreamento em tempo real responde à pergunta "onde está meu pedido?" sem o cliente precisar ligar. Menos suporte, mais confiança.',
  },
  {
    icon: '📋',
    title: 'Registro completo das rotas',
    desc: 'Histórico de todas as entregas com localização GPS, horários exatos e provas fotográficas — tudo acessível no painel.',
  },
  {
    icon: '📈',
    title: 'Métricas que geram decisões',
    desc: 'Saiba quais entregadores têm melhor avaliação, quais rotas demoram mais e quantas entregas aconteceram em cada período.',
  },
  {
    icon: '🤝',
    title: 'Profissionalização imediata',
    desc: 'Código de coleta, confirmação com foto e notificações automáticas elevam o padrão das suas entregas sem aumentar a equipe.',
  },
  {
    icon: '⚡',
    title: 'Menos erros, mais agilidade',
    desc: 'Entregadores confirmam cada etapa no app — coleta, rota e entrega — eliminando dúvidas e retrabalho na operação.',
  },
  {
    icon: '🔒',
    title: 'Controle e segurança',
    desc: 'Permissões por papel (proprietário, gerente, assistente), histórico de ações e acesso restrito por função garantem que cada um veja só o que precisa.',
  },
]

const PLANS = [
  {
    name: 'Starter',
    price: 50,
    deliverers: 1,
    deliveries: 50,
    features: ['1 entregador', 'Até 50 entregas/mês', 'App do entregador', 'Painel de pedidos', 'Link de rastreamento', 'Confirmação com foto e código'],
    highlight: false,
    badge: null,
  },
  {
    name: 'Starter + WhatsApp',
    price: 60,
    deliverers: 1,
    deliveries: 50,
    features: ['1 entregador', 'Até 50 entregas/mês', 'App do entregador', 'Painel de pedidos', 'Link de rastreamento', 'Confirmação com foto e código', 'Notificações WhatsApp automáticas'],
    highlight: false,
    badge: null,
  },
  {
    name: 'Pro',
    price: 80,
    deliverers: 2,
    deliveries: 100,
    features: ['Até 2 entregadores', 'Até 100 entregas/mês', 'App do entregador', 'Painel de pedidos', 'Link de rastreamento', 'Confirmação com foto e código', 'Avaliação de entregadores', 'Exportação CSV'],
    highlight: false,
    badge: null,
  },
  {
    name: 'Pro + WhatsApp',
    price: 100,
    deliverers: 2,
    deliveries: 100,
    features: ['Até 2 entregadores', 'Até 100 entregas/mês', 'App do entregador', 'Painel de pedidos', 'Link de rastreamento', 'Confirmação com foto e código', 'Avaliação de entregadores', 'Exportação CSV', 'Notificações WhatsApp automáticas'],
    highlight: true,
    badge: 'Mais popular',
  },
  {
    name: 'Pro Premium',
    price: 120,
    deliverers: 2,
    deliveries: 100,
    features: ['Até 2 entregadores', 'Até 100 entregas/mês', 'App do entregador', 'Painel de pedidos', 'Link de rastreamento', 'Confirmação com foto e código', 'Avaliação de entregadores', 'Exportação CSV', 'Notificações WhatsApp automáticas', 'Logo e cores personalizadas'],
    highlight: false,
    badge: null,
  },
]

// ─── components ──────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  )
}

// ─── page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">

      {/* ── Nav ── */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600">
              <span className="text-sm font-bold text-white">L</span>
            </div>
            <span className="text-lg font-bold text-gray-900">LogiFlow</span>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              Entrar
            </Link>
            <Link
              href="/cadastro"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Começar grátis
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-6">
        <div className="mx-auto max-w-4xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            3 meses grátis — sem cartão de crédito
          </div>
          <h1 className="mb-6 text-5xl font-bold leading-tight text-gray-900 sm:text-6xl">
            Entregas urbanas{' '}
            <span className="text-blue-600">organizadas</span>{' '}
            de verdade
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-xl text-gray-500 leading-relaxed">
            Do pedido à confirmação com foto — gerencie seus entregadores, rotas e clientes em um único lugar.
            Seus clientes acompanham a entrega em tempo real.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/cadastro"
              className="rounded-xl bg-blue-600 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors"
            >
              Começar 3 meses grátis
            </Link>
            <a
              href="#planos"
              className="rounded-xl border border-gray-200 px-8 py-4 text-base font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Ver planos
            </a>
          </div>
        </div>
      </section>

      {/* ── App download banner ── */}
      <section className="bg-gray-900 py-16 px-6">
        <div className="mx-auto max-w-5xl flex flex-col items-center gap-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-center sm:text-left">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-green-500/20 px-3 py-1 text-sm font-medium text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
              Disponível agora para Android
            </div>
            <h2 className="mb-3 text-3xl font-bold text-white">
              App do entregador — gratuito
            </h2>
            <p className="max-w-md text-gray-400 leading-relaxed">
              Sem mensalidade para o entregador, sem limite de entregas por rota.
              Baixe agora e comece a usar em minutos.
            </p>
            <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-400">
              {['Sem limite de entregas', 'Navegação integrada', 'Confirmação com foto', 'Offline parcial'].map(item => (
                <li key={item} className="flex items-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-center gap-4">
            <a
              href="https://github.com/josemiguelq/logiflow-app/releases/download/v1.0.0/app-release.apk"
              download
              className="flex items-center gap-3 rounded-2xl bg-white px-7 py-4 text-gray-900 font-semibold shadow-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.523 15.341a.75.75 0 01-.06 1.06 9.75 9.75 0 01-11.003 1.63l-1.94 1.94a.75.75 0 01-1.06-1.06l1.94-1.94A9.75 9.75 0 0116.463 5.463a.75.75 0 011.06 1.06 8.25 8.25 0 00-9.31 13.4l.003.003a8.25 8.25 0 009.307-4.585zM12 8.25a.75.75 0 01.75.75v3.44l1.72 1.72a.75.75 0 11-1.06 1.06l-2-2A.75.75 0 0111.25 12V9a.75.75 0 01.75-.75z" />
              </svg>
              <div className="text-left">
                <div className="text-xs text-gray-500 font-normal">Baixar para</div>
                <div className="text-base">Android (.apk)</div>
              </div>
            </a>
            <p className="text-xs text-gray-500">v1.0.0 · Grátis para entregadores</p>
          </div>
        </div>
      </section>

      {/* ── Social proof strip ── */}
      <section className="border-y border-gray-100 bg-gray-50 py-5 px-6">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-center gap-x-10 gap-y-3 text-sm text-gray-500">
          {['App nativo para entregadores', 'Painel web completo', 'Rastreamento GPS em tempo real', 'Notificações WhatsApp', 'Sem limite de entregas', 'Sem custo de setup'].map(item => (
            <span key={item} className="flex items-center gap-1.5">
              <CheckIcon />
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="py-24 px-6" id="funcionalidades">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold text-gray-900">Tudo que sua operação precisa</h2>
            <p className="mx-auto max-w-xl text-lg text-gray-500">
              Do app do entregador ao painel do gestor — cada etapa da entrega coberta.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(f => (
              <div
                key={f.title}
                className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-100 transition-all"
              >
                <div className="mb-4 text-3xl">{f.icon}</div>
                <h3 className="mb-2 text-base font-semibold text-gray-900">{f.title}</h3>
                <p className="text-sm leading-relaxed text-gray-500">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Benefits ── */}
      <section className="bg-gray-50 py-24 px-6">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-4xl font-bold text-gray-900">Por que o LogiFlow funciona</h2>
            <p className="mx-auto max-w-xl text-lg text-gray-500">
              Resultados reais para quem já cansou de gerenciar entrega por WhatsApp e planilha.
            </p>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {BENEFITS.map(b => (
              <div key={b.title} className="flex gap-4">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-xl">
                  {b.icon}
                </div>
                <div>
                  <h3 className="mb-1.5 font-semibold text-gray-900">{b.title}</h3>
                  <p className="text-sm leading-relaxed text-gray-500">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="py-24 px-6" id="planos">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 text-center">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-green-100 bg-green-50 px-4 py-1.5 text-sm font-medium text-green-700">
              ✅ 3 meses de trial gratuito em qualquer plano
            </div>
            <h2 className="mb-4 text-4xl font-bold text-gray-900">Planos simples e transparentes</h2>
            <p className="mx-auto max-w-xl text-lg text-gray-500">
              Escolha o plano que cabe na sua operação. Escale quando precisar.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {PLANS.map(plan => (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-2xl border p-6 ${
                  plan.highlight
                    ? 'border-blue-500 bg-blue-600 shadow-xl shadow-blue-200 text-white'
                    : 'border-gray-200 bg-white shadow-sm'
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-orange-500 px-3 py-1 text-xs font-bold text-white shadow">
                    {plan.badge}
                  </div>
                )}

                <div className="mb-4">
                  <p className={`text-sm font-semibold mb-3 ${plan.highlight ? 'text-blue-100' : 'text-gray-500'}`}>
                    {plan.name}
                  </p>
                  <div className="flex items-end gap-1">
                    <span className={`text-4xl font-bold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                      R${plan.price}
                    </span>
                    <span className={`mb-1 text-sm ${plan.highlight ? 'text-blue-200' : 'text-gray-400'}`}>/mês</span>
                  </div>
                  <div className={`mt-2 flex flex-wrap gap-2 text-xs ${plan.highlight ? 'text-blue-100' : 'text-gray-500'}`}>
                    <span className={`rounded-full px-2 py-0.5 ${plan.highlight ? 'bg-blue-500' : 'bg-gray-100'}`}>
                      {plan.deliverers} entregador{plan.deliverers > 1 ? 'es' : ''}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 ${plan.highlight ? 'bg-blue-500' : 'bg-gray-100'}`}>
                      {plan.deliveries} entregas/mês
                    </span>
                  </div>
                </div>

                <ul className="mb-6 flex-1 space-y-2.5">
                  {plan.features.map(feat => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      {plan.highlight ? (
                        <svg className="h-4 w-4 shrink-0 mt-0.5 text-blue-200" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <CheckIcon />
                      )}
                      <span className={plan.highlight ? 'text-blue-50' : 'text-gray-600'}>{feat}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  href="/cadastro"
                  className={`block rounded-xl py-3 text-center text-sm font-semibold transition-colors ${
                    plan.highlight
                      ? 'bg-white text-blue-600 hover:bg-blue-50'
                      : 'bg-gray-900 text-white hover:bg-gray-700'
                  }`}
                >
                  Começar grátis
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-gray-400">
            Todos os planos incluem 3 meses de trial completo. Cancele quando quiser.
          </p>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="bg-blue-600 py-20 px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-4xl font-bold text-white">
            Comece a organizar suas entregas hoje
          </h2>
          <p className="mb-8 text-lg text-blue-100">
            3 meses grátis, sem cartão de crédito. Configure em menos de 5 minutos.
          </p>
          <Link
            href="/cadastro"
            className="inline-block rounded-xl bg-white px-8 py-4 text-base font-semibold text-blue-600 shadow-lg hover:bg-blue-50 transition-colors"
          >
            Criar conta gratuita
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-gray-100 bg-white py-10 px-6">
        <div className="mx-auto max-w-6xl flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
              <span className="text-xs font-bold text-white">L</span>
            </div>
            <span className="font-semibold text-gray-900">LogiFlow</span>
          </div>
          <p className="text-sm text-gray-400">© {new Date().getFullYear()} LogiFlow. Todos os direitos reservados.</p>
          <Link href="/login" className="text-sm text-gray-500 hover:text-gray-900">
            Acessar painel →
          </Link>
        </div>
      </footer>

    </div>
  )
}

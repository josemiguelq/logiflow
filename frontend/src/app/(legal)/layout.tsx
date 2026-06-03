import Link from 'next/link'

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600">
              <span className="text-xs font-bold text-white">L</span>
            </div>
            <span className="font-semibold text-gray-900">LogiFlow</span>
          </Link>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
            ← Início
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>

      <footer className="border-t border-gray-100 bg-white px-6 py-8">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 text-sm text-gray-400">
          <span>© {new Date().getFullYear()} LogiFlow</span>
          <div className="flex gap-4">
            <Link href="/privacidade" className="hover:text-gray-700">Privacidade</Link>
            <Link href="/termos" className="hover:text-gray-700">Termos de Uso</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

import type { DB } from '../shared/db/client'

export interface JobLogger {
  info:  (obj: unknown, msg?: string) => void
  error: (obj: unknown, msg?: string) => void
}

export interface JobContext {
  db:  DB
  log: JobLogger
}

// Um worker/job que o runner (worker.ts) sabe rodar. Para adicionar um novo
// worker, basta implementar esta interface e registrá-lo em ./registry.
export interface Job {
  // Identificador único: usado na seleção (env WORKERS) e nos logs.
  name: string
  // Intervalo entre execuções no modo serviço contínuo (ms).
  intervalMs: number
  // Executa uma passada do trabalho. Deve lançar em caso de erro (o runner loga
  // e, no modo one-shot, sai com código != 0).
  run: (ctx: JobContext) => Promise<void>
}

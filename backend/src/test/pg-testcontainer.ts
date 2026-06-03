import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import type { DB } from '../shared/db/client'

export interface TestPg {
  db: DB
  pool: Pool
  stop: () => Promise<void>
}

/**
 * Spins up a real Postgres in a throwaway Docker container (via testcontainers),
 * applies the project's migrations, and returns a `db` matching the app's DB
 * interface. Requires Docker to be running.
 */
export async function startTestPostgres(): Promise<TestPg> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:16-alpine').start()
  const pool = new Pool({ connectionString: container.getConnectionUri() })

  // Apply the real migrations, in filename order — same schema as production.
  const migrationsDir = join(__dirname, '..', 'shared', 'db', 'migrations')
  const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    await pool.query(sql)
  }

  const db = {
    query: (text: string, params?: unknown[]) => pool.query(text, params),
    connect: () => pool.connect(),
    async transaction<T>(fn: (client: unknown) => Promise<T>): Promise<T> {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(client)
        await client.query('COMMIT')
        return result
      } catch (err) {
        await client.query('ROLLBACK')
        throw err
      } finally {
        client.release()
      }
    },
  } as unknown as DB

  return {
    db,
    pool,
    stop: async () => {
      await pool.end()
      await container.stop()
    },
  }
}

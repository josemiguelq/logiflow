import { Pool, PoolClient } from 'pg'

const dbUrl = process.env.DATABASE_URL ?? ''
const needsSsl = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = {
  query: pool.query.bind(pool),
  connect: pool.connect.bind(pool),

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
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
}

export type DB = typeof db

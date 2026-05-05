import dns from 'dns'
import { Pool, PoolClient } from 'pg'

// Render's PostgreSQL host resolves to IPv6 but only IPv4 is reachable
// on the internal network, so force the DNS resolver to prefer IPv4.
dns.setDefaultResultOrder('ipv4first')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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

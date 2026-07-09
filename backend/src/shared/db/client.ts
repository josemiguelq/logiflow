import { Pool, PoolClient } from 'pg'

const dbUrl = process.env.DATABASE_URL ?? ''
const needsSsl = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')

const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
  max: 20,
  // Banco remoto (Render) acessado de fora da rede do Render: abrir conexão custa
  // ~1s (handshake TLS sobre rede pública). Mantemos as conexões quentes para
  // pagar esse custo raramente, em vez de a cada requisição após 30s de ociosidade.
  idleTimeoutMillis: 0,            // não derruba conexões ociosas
  connectionTimeoutMillis: 5_000,
  keepAlive: true,                 // TCP keepalive — evita o servidor cortar a conexão ociosa
})

// Aquece o pool no boot: abre uma conexão já de cara, para a primeira requisição
// real não pagar o handshake de ~1s.
pool.connect()
  .then((c) => c.release())
  .catch(() => { /* primeira query reabre; não derrubar o processo por isso */ })
export const db = {
  query: pool.query.bind(pool),
  connect: pool.connect.bind(pool),

  // Estado do pool de conexões (para o /health).
  poolStats() {
    return { total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }
  },

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

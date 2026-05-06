import 'dotenv/config'
import { db } from './client'

async function reset() {
  console.log('[reset] apagando schema público...')

  await db.query('DROP SCHEMA public CASCADE')
  await db.query('CREATE SCHEMA public')
  await db.query('GRANT ALL ON SCHEMA public TO public')

  console.log('[reset] schema recriado. Rode agora:')
  console.log('  npm run migrate && npm run seed')
  process.exit(0)
}

reset().catch((err) => {
  console.error('[reset] erro:', err)
  process.exit(1)
})

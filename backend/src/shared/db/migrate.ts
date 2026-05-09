import 'dotenv/config'
import { readFileSync } from 'fs'
import { join } from 'path'
import { db } from './client'

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name   TEXT        PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const migrationDir = join(__dirname, 'migrations')
  const files = ['001_schema.sql']

  for (const file of files) {
    const { rows } = await db.query('SELECT name FROM _migrations WHERE name = $1', [file])
    if (rows.length > 0) {
      console.log(`[migrate] skipping ${file} (already applied)`)
      continue
    }

    const sql = readFileSync(join(migrationDir, file), 'utf-8')
    await db.query(sql)
    await db.query('INSERT INTO _migrations(name) VALUES($1)', [file])
    console.log(`[migrate] applied ${file}`)
  }

  console.log('[migrate] done')
  process.exit(0)
}

migrate().catch((err) => {
  console.error('[migrate] error', err)
  process.exit(1)
})

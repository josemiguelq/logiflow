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
  const files = ['001_initial.sql', '002_theme.sql', '003_deliverer_active.sql', '004_deliverer_onboarding.sql', '005_customer_addresses.sql', '006_routes.sql', '007_features.sql', '008_location_simple.sql', '009_deliverer_status_history.sql', '010_code_settings.sql']

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

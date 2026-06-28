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
  const files = ['001_schema.sql', '002_billing.sql', '003_drop_customer_address_columns.sql', '004_order_cancellation.sql', '005_goals.sql', '006_order_reservations.sql', '007_cash_payment.sql', '008_payment_methods_setting.sql', '009_push_tokens.sql', '010_multi_proof.sql', '011_delay_alerts.sql', '012_delivery_rules.sql', '013_order_audit.sql', '014_cancel_reason.sql', '015_operator_delay_alert.sql', '016_deliverer_track_scope.sql', '017_privacy_setting.sql', '018_orders_view_all_scope.sql', '019_gamification.sql', '020_store_user_sessions.sql', '021_customer_address_audit.sql', '022_prospects_and_store_document.sql', '023_plans.sql', '024_order_arrival.sql', '025_whatsapp_notify_statuses.sql', '026_message_logs_wa_id.sql', '027_customer_updated_at_audit.sql', '028_store_invite_code.sql', '029_deliverer_username_per_store.sql', '030_message_logs_error.sql', '031_assistances.sql', '032_user_reset_password.sql', '033_soft_delete_customers_deliverers.sql', '034_deliverer_terms_and_tour.sql', '035_announcements.sql', '036_payment_collection.sql', '037_proof_idempotency.sql', '038_order_payments.sql', '039_store_user_google_auth.sql', '040_route_audit.sql']

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

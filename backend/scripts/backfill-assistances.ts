/**
 * Backfill de assistências a partir do nome do cliente.
 *
 * Para cada cliente cujo nome contém "#", extrai o texto APÓS o "#" como nome
 * da assistência, cria a assistência (idempotente por loja) e vincula o cliente
 * (não sobrescreve clientes que já têm assistência).
 *
 * Uso:
 *   npm run backfill-assistances              # dry-run: só mostra o que faria
 *   npm run backfill-assistances -- --commit  # aplica as mudanças
 *
 * Requer que a migration 031_assistances.sql já tenha sido aplicada.
 * Exige DATABASE_URL no .env.
 */
import 'dotenv/config'
import { Pool } from 'pg'

const COMMIT = process.argv.includes('--commit')
const ACTOR  = 'backfill (#)'   // identifica a origem na auditoria

// Casamento case/acento-insensível (igual à busca da app) para linkar à
// assistência CORRESPONDENTE já existente em vez de criar duplicada.
const ACCENTS = 'áàâãäçéèêëíìîïñóòôõöúùûü'
const PLAIN   = 'aaaaaceeeeiiiinooooouuuu'
const norm = (s: string) => {
  const lower = s.toLowerCase()
  let out = ''
  for (const ch of lower) {
    const i = ACCENTS.indexOf(ch)
    out += i >= 0 ? PLAIN[i]! : ch
  }
  return out
}

const dbUrl = process.env.DATABASE_URL ?? ''
if (!dbUrl) {
  console.error('DATABASE_URL não configurada no .env')
  process.exit(1)
}
const needsSsl = !dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')
const pool = new Pool({
  connectionString: dbUrl,
  ssl: needsSsl ? { rejectUnauthorized: false } : false,
})

async function run() {
  const client = await pool.connect()
  try {
    const { rows: customers } = await client.query<{
      id: string; store_id: string; name: string; assistance_id: string | null
    }>(
      `SELECT id, store_id, name, assistance_id
       FROM customers
       WHERE name LIKE '%#%'
       ORDER BY store_id, name`
    )

    console.log(
      `\n${customers.length} cliente(s) com "#" no nome.` +
      (COMMIT ? '' : '  (DRY-RUN — nada será gravado)') + '\n'
    )

    // Cache loja+nome -> assistanceId, evita buscas/inserts repetidos no loop.
    const cache = new Map<string, string>()
    let created = 0, linked = 0, alreadyLinked = 0, skipped = 0

    for (const c of customers) {
      const assistanceName = c.name.slice(c.name.indexOf('#') + 1).trim()
      if (!assistanceName) { skipped++; continue }          // "João #" → nada após o #
      if (c.assistance_id)  { alreadyLinked++; continue }   // respeita vínculo existente

      const key = `${c.store_id}::${norm(assistanceName)}`
      let assistanceId = cache.get(key)

      if (!assistanceId) {
        // Casa a CORRESPONDENTE existente ignorando caixa/acentos.
        const { rows: [existing] } = await client.query<{ id: string }>(
          `SELECT id FROM assistances
           WHERE store_id = $1
             AND translate(lower(name), $3, $4) = translate(lower($2), $3, $4)
           ORDER BY created_at ASC
           LIMIT 1`,
          [c.store_id, assistanceName, ACCENTS, PLAIN]
        )
        if (existing) {
          assistanceId = existing.id
        } else if (COMMIT) {
          const { rows: [ins] } = await client.query<{ id: string }>(
            `INSERT INTO assistances (store_id, name, created_by_name)
             VALUES ($1, $2, $3) RETURNING id`,
            [c.store_id, assistanceName, ACTOR]
          )
          assistanceId = ins.id
          await client.query(
            `INSERT INTO assistance_audit (store_id, assistance_id, action, after, changed_by_name)
             VALUES ($1, $2, 'CREATED', $3, $4)`,
            [c.store_id, assistanceId, JSON.stringify({ name: assistanceName }), ACTOR]
          )
          created++
          console.log(`  + assistência "${assistanceName}"  (loja …${c.store_id.slice(-8)})`)
        } else {
          assistanceId = 'DRYRUN'
          created++
          console.log(`  + [criaria] "${assistanceName}"  (loja …${c.store_id.slice(-8)})`)
        }
        cache.set(key, assistanceId)
      }

      if (COMMIT && assistanceId !== 'DRYRUN') {
        // Auditoria embutida no cliente (mesmo formato do PUT /customers).
        const audit = [{
          changedBy: null,
          changedByName: ACTOR,
          changedAt: new Date().toISOString(),
          changes: [{ field: 'assistance', before: null, after: assistanceName }],
        }]
        await client.query(
          `UPDATE customers
           SET assistance_id = $1, updated_at = now(), audit = audit || $3::jsonb
           WHERE id = $2`,
          [assistanceId, c.id, JSON.stringify(audit)]
        )
      }
      linked++
      console.log(`  ↪ "${c.name}"  →  "${assistanceName}"`)
    }

    console.log(
      `\n${COMMIT ? 'Concluído' : 'Dry-run'}: ${linked} vínculo(s), ` +
      `${created} assistência(s) ${COMMIT ? 'criada(s)' : 'a criar'}, ` +
      `${alreadyLinked} já vinculado(s), ${skipped} ignorado(s) (vazio após #).`
    )
    if (!COMMIT) {
      console.log('\nRode com  npm run backfill-assistances -- --commit  para aplicar.\n')
    }
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})

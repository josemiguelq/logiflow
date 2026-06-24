// Gera dist/version.json com o horário do build. Rodado pelo `npm run build`
// (tsc roda antes, então dist/ já existe). A rota GET /version lê esse arquivo
// para confirmar qual build está no ar.
const fs = require('fs')
const path = require('path')

const out = path.join(__dirname, '..', 'dist', 'version.json')
const data = { buildTime: new Date().toISOString() }
fs.writeFileSync(out, JSON.stringify(data))
console.log('[build] version.json:', data.buildTime)

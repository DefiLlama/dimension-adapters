// Read-only comparison against values displayed in Token Terminal's public chart.
// Run: pnpm exec ts-node --transpile-only fees/gearbox/reconcile.ts 2026-10-18 ethereum
import runAdapter from '../../adapters/utils/runAdapter'
import adapter from './index'
import { GearboxConfigs } from './configs'

const reference: Record<string, Record<string, number>> = {
  '2026-09-26': { ethereum: 41.57011, monad: 120.4726, plasma: 2.08988 },
  '2026-10-08': { ethereum: 55.21961, monad: 9.74568, plasma: 2.08905 },
  '2026-10-16': { ethereum: 60.94071, monad: 3.57028, plasma: 2.08808 },
  '2026-10-18': { ethereum: 65.12958, monad: 3.83142, plasma: 2.08823 },
}

async function main() {
  const [date, chain] = process.argv.slice(2)
  if (!reference[date]?.[chain]) throw new Error('Choose a recorded date and chain from reference')
  const v3Only = process.argv.includes('--v3-only')
  if (v3Only) GearboxConfigs[chain].services = GearboxConfigs[chain].services.filter(service => service.version === 3)
  const result: any = await runAdapter({
    module: adapter, endTimestamp: Date.parse(`${date}T00:00:00Z`) / 1000 + 86400,
    name: 'gearbox', onlyChains: new Set([chain]), withMetadata: true,
    // Use the same full UTC day as the production daily adapter.
    runWindowInSeconds: 86400,
  })
  const tokens = result.breakdownByToken[chain]
  const actual = tokens.dailyRevenue.usdTvl
  const expected = reference[date][chain]
  console.log(JSON.stringify({ date, chain, scope: v3Only ? 'V3/V3.1 only' : 'all versions', expected, actual, difference: actual - expected,
    differencePercent: (actual / expected - 1) * 100, tokens, labels: result.adaptorRecordV2JSON.breakdownByLabel,
    source: 'https://tokenterminal.com/explorer/projects/gearbox/metrics/revenue?interval=30d&granularity=day&view=data',
    sourceObserved: '2026-10-19',
  }, null, 2))
}

main().catch(error => { console.error(error); process.exitCode = 1 })

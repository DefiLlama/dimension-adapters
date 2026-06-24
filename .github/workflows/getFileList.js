const { execSync } = require('child_process')

const ALLOWED_ROOTS = ['volumes', 'dexs', 'options', 'derivatives', 'incentives', 'fees', 'protocols', 'aggregators', 'aggregator-derivatives', 'bridge-aggregators', 'open-interest']

// exposes protocol names as `"<module>":`
const ALLOWED_FACTORIES = ['uniV2', 'uniV3', 'uniSubgraph', 'blockscout', 'hyperliquid', 'compoundV2', 'orderly', 'gmxV1', 'chainTxFees', 'curators', 'saddle', 'solLst', 'joeLiquidityBook',
  'helpers/aave/index.ts', 'helpers/liquity.ts', 'helpers/balancer.ts', 'helpers/friend-tech.ts', 'helpers/solidly.ts',
].map(f => f.includes('/') ? f : `factory/${f}.ts`)

const MODIFIED = parse(process.env.MODIFIED)
const ADDED = parse(process.env.ADDED)
const diffBase = process.env.DIFF_BASE || 'HEAD~1'
const fileSet = new Set();

[...MODIFIED, ...ADDED].forEach(file => {
  // Skip markdown documentation files (e.g., GUIDELINES.md)
  if (!file || file.endsWith('.md')) return

  const [root, adapter] = file.split('/')
  if (ALLOWED_ROOTS.includes(root) && adapter !== undefined)
    fileSet.add(`${root}@${adapter}`)

  if (ALLOWED_FACTORIES.includes(file)) {
    addedProtocolKeys(file).forEach(protocolName => fileSet.add(`fees@${protocolName}`))
  }
})

console.log(JSON.stringify([...fileSet]))

function addedProtocolKeys(file) {
  const names = new Set()
  let diff = ''
  try {
    diff = execSync(`git diff ${diffBase} -- "${file}"`).toString()
  } catch (e) {
    return names
  }
  const lines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'))
  for (const line of lines) {
    const match = line.match(/^\+\s*['"]([a-zA-Z0-9][a-zA-Z0-9_-]+)['"]\s*:\s*\{/)
    if (match) names.add(match[1])
  }
  return names
}

function parse(data) {
  return data.replace('[', '').replace(']', '').split(',')
}

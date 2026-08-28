const path = require('path')
const fs = require('fs')
const childProcess = require('child_process')
const inquirer = require('inquirer')

require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const REPO_ROOT = path.resolve(__dirname, '..')
const MODULES_PATH = path.join(REPO_ROOT, 'cli/dimensionModules.json')
// Adapter type folders, kept in sync with adapters/types.ts ADAPTER_TYPES.
// derivatives share the dexs folder so they are not listed on disk separately.
const ADAPTER_TYPES = [
  'fees', 'dexs', 'incentives', 'aggregators', 'options', 'open-interest',
  'aggregator-derivatives', 'bridge-aggregators', 'normalized-volume',
  'nft-volume', 'active-users', 'new-users', 'liquidations',
]
const ADAPTER_TYPE_SET = new Set(ADAPTER_TYPES)
const EXCLUDE_NAMES = new Set(['index', 'README', 'GUIDELINES', '.gitkeep'])

const args = process.argv.slice(2)
const subdir = args[0] // e.g. 'dexs', 'fees'; undefined => list mode across all types

async function main() {
  if (subdir) {
    await runFuzzyMode(subdir)
    return
  }

  await runBuild()
  const state = buildChoices()
  startGitRefresh(state)
  await runListMode(state)
}

function startGitRefresh(state, intervalMs = 5000) {
  const tick = () => {
    try {
      const changed = listGitChangedAdapters(state.buildCommit)
      let added = 0
      for (const value of changed) {
        if (state.seen.has(value)) continue
        state.seen.add(value)
        state.choices.unshift({ value, tag: 'changed', name: `[changed] ${value}` })
        added++
      }
      if (added) console.log(`\n(${added} new adapter${added > 1 ? 's' : ''} detected — type to refresh list)`)
    } catch { /* ignore */ }
  }
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
}

function runBuild() {
  console.log('Running `npm run build`...')
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn('npm', ['run', 'build'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`npm run build exited with code ${code}`))
      else resolve()
    })
  })
}

// Returns { choices, seen, buildCommit }. choices is mutated in place by the refresher.
// Values are "<adapterType>/<name>" paths accepted directly by cli/testAdapter.ts.
function buildChoices() {
  const raw = fs.readFileSync(MODULES_PATH, 'utf8')
  const map = JSON.parse(raw)
  const buildCommit = currentGitCommit()

  const tags = new Map() // value -> tag string|null
  const setTag = (value, tag) => {
    if (!tags.has(value)) tags.set(value, tag)
  }

  // Everything the build could resolve into a module.
  for (const adapterType of Object.keys(map)) {
    if (adapterType === '_meta') continue
    for (const name of Object.keys(map[adapterType])) setTag(`${adapterType}/${name}`, null)
  }

  // On disk but not in the built module map -> likely broken / missing default export.
  for (const value of listAdaptersOnDisk()) {
    if (!tags.has(value)) setTag(value, 'missing')
  }

  for (const value of listGitChangedAdapters(buildCommit)) {
    tags.set(value, 'changed')
  }

  const choices = [...tags.entries()].map(([value, tag]) => ({
    value,
    tag,
    name: tag ? `[${tag}] ${value}` : value,
  }))

  choices.sort((a, b) => {
    if (!!a.tag !== !!b.tag) return a.tag ? -1 : 1
    return a.value.localeCompare(b.value)
  })

  return { choices, seen: new Set(tags.keys()), buildCommit }
}

function currentGitCommit() {
  try {
    return childProcess.execSync('git rev-parse HEAD', { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim() || null
  } catch { return null }
}

// List "<adapterType>/<name>" for every adapter file/folder on disk.
function listAdaptersOnDisk() {
  const out = []
  for (const adapterType of ADAPTER_TYPES) {
    const dir = path.join(REPO_ROOT, adapterType)
    let entries
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { continue }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (fs.existsSync(path.join(dir, entry.name, 'index.ts'))) out.push(`${adapterType}/${entry.name}`)
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        const name = entry.name.replace(/\.ts$/, '')
        if (EXCLUDE_NAMES.has(name)) continue
        out.push(`${adapterType}/${name}`)
      }
    }
  }
  return out
}

// Return "<adapterType>/<name>" values for adapters touched since the build commit or in the working tree.
function listGitChangedAdapters(buildCommit) {
  const paths = new Set()
  const collect = (cmd) => {
    try {
      const out = childProcess.execSync(cmd, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString()
      out.split('\n').filter(Boolean).forEach((p) => paths.add(p))
    } catch { /* ignore */ }
  }

  const scope = ADAPTER_TYPES.join(' ')
  if (buildCommit) collect(`git diff --name-only ${buildCommit} -- ${scope}`)
  collect(`git diff --name-only HEAD -- ${scope}`)
  collect(`git ls-files --others --exclude-standard -- ${scope}`)

  const adapters = new Set()
  for (const p of paths) {
    // p looks like dexs/foo.ts or dexs/foo/bar.ts
    const parts = p.split('/')
    const adapterType = parts[0]
    if (!ADAPTER_TYPE_SET.has(adapterType) || parts.length < 2) continue

    // folder adapter: <type>/<name>/... -> <type>/<name> (requires index.ts on disk)
    if (parts.length > 2) {
      const name = parts[1]
      if (fs.existsSync(path.join(REPO_ROOT, adapterType, name, 'index.ts'))) {
        adapters.add(`${adapterType}/${name}`)
      }
      continue
    }

    // file adapter: <type>/<name>.ts
    const file = parts[1]
    if (!file.endsWith('.ts')) continue
    const name = file.replace(/\.ts$/, '')
    if (EXCLUDE_NAMES.has(name)) continue
    if (fs.existsSync(path.join(REPO_ROOT, adapterType, file))) adapters.add(`${adapterType}/${name}`)
  }
  return [...adapters]
}

async function runListMode(state) {
  inquirer.registerPrompt('autocomplete', require('inquirer-autocomplete-prompt'))
  const fuzzy = require('fuzzy')

  let last
  while (true) {
    const { adapter } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'adapter',
        message: 'Select an adapter to run:',
        default: last,
        pageSize: 20,
        source: async (_answers, input) => {
          const list = input
            ? fuzzy.filter(input, state.choices, { extract: (c) => c.name }).map((r) => r.original)
            : state.choices
          return list.map((c) => ({ name: c.name, value: c.value }))
        },
      },
    ])
    last = adapter
    await runAdapter(adapter)
  }
}

async function runFuzzyMode(rel) {
  inquirer.registerPrompt('fuzzypath', require('inquirer-fuzzy-path'))
  const targetDir = path.join(REPO_ROOT, rel)
  process.chdir(targetDir)
  console.log('Working directory: ' + process.cwd())

  const prompt = {
    type: 'fuzzypath',
    name: 'adapterPath',
    excludePath: (p) => p.startsWith('helper'),
    excludeFilter: (p) => p === '.',
    itemType: 'any',
    rootPath: '.',
    message: 'Select an adapter to run:',
    suggestOnly: false,
    depthLimit: 1,
  }

  let { adapterPath } = await inquirer.prompt([prompt])
  while (true) {
    prompt.default = adapterPath
    // fuzzy mode is scoped to a single adapter type dir; rebuild the full "<type>/<name>" value.
    await runAdapter(`${rel}/${adapterPath}`)
    const ans = await inquirer.prompt([prompt])
    adapterPath = ans.adapterPath
  }
}

// adapterValue is "<adapterType>/<name>" — testAdapter.ts accepts it as a single argument.
function runAdapter(adapterValue) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      LLAMA_SDK_MAX_PARALLEL: 100,
      LLAMA_DEBUG_MODE: true,
      DEBUG_MODE: true,
    }
    const startTime = Date.now()
    const child = childProcess.spawn(
      'npx',
      ['ts-node', '--transpile-only', 'cli/testAdapter.ts', ...adapterValue.split('/')],
      { cwd: REPO_ROOT, env },
    )
    child.stdout.pipe(process.stdout)
    child.stderr.pipe(process.stderr)
    child.on('error', reject)
    child.on('close', () => {
      console.log(`\n      Run time: ${(Date.now() - startTime) / 1000} (seconds)\n`)
      resolve()
    })
  })
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

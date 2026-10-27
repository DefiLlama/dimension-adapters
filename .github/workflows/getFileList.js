const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ALLOWED_ROOTS = ['volumes', 'dexs', 'options', 'derivatives', 'incentives', 'fees', 'protocols', 'aggregators', 'aggregator-derivatives', 'bridge-aggregators', 'open-interest',
  'bridges', 'liquidations', 'normalized-volume', 'nft-volume', 'active-users', 'new-users']

// an edit inside more existing entries than this is a shared-code/format change, testing each entry is too noisy
const MAX_FACTORY_KEYS_PER_FILE = 10

const MODIFIED = parse(process.env.MODIFIED)
const ADDED = parse(process.env.ADDED)
const diffBase = process.env.DIFF_BASE || 'HEAD~1'
const repoRoot = path.resolve(__dirname, '../..')
const fileSet = new Set();

let factoriesByFile;

[...MODIFIED, ...ADDED].forEach(file => {
  // Skip markdown documentation files (e.g., AGENTS.md)
  if (!file || file.endsWith('.md')) return

  const [root, adapter] = file.split('/')
  if (ALLOWED_ROOTS.includes(root) && adapter !== undefined)
    fileSet.add(`${root}@${adapter}`)

  if (!file.endsWith('.ts')) return
  if (!factoriesByFile) factoriesByFile = loadFactories()
  const factories = factoriesByFile[file]
  if (factories) changedFactoryKeys(file, factories).forEach(key => fileSet.add(key))
})

console.log(JSON.stringify([...fileSet]))

// map each factory source file to the adapter types it is registered under and the protocol keys it exposes there
function loadFactories() {
  require('ts-node').register({ transpileOnly: true, compilerOptions: { module: 'commonjs' } })
  const { AdapterType } = require(path.join(repoRoot, 'adapters/types'))
  const { getHelpersForAdapterType } = require(path.join(repoRoot, 'factory/registry'))
  const byFile = {}
  for (const adapterType of Object.values(AdapterType)) {
    for (const factoryPath of getHelpersForAdapterType(adapterType)) {
      // same resolution as resolveFactoryPath in factory/registry.ts
      const [pathPart, exportName] = factoryPath.split(':')
      const modulePath = pathPart.includes('/') ? pathPart : `factory/${pathPart}`
      const file = [`${modulePath}.ts`, `${modulePath}/index.ts`].find(f => fs.existsSync(path.join(repoRoot, f)))
      if (!file) continue
      let protocolList
      try {
        const factoryModule = require(path.join(repoRoot, modulePath))
        protocolList = (exportName ? factoryModule[exportName] : factoryModule)?.protocolList
      } catch (e) {
        console.error(`Failed to load factory ${factoryPath}: ${e.message}`)
        continue
      }
      if (!protocolList) continue
      byFile[file] = byFile[file] || []
      byFile[file].push({ adapterType, protocolList: new Set(protocolList) })
    }
  }
  return byFile
}

// protocol entries whose lines the diff touches, as `<adapterType>@<key>` for every type that lists the key
function changedFactoryKeys(file, factories) {
  const allKeys = new Set(factories.flatMap(f => [...f.protocolList]))
  const keyLine = /^(\s*)['"]?([a-zA-Z0-9][a-zA-Z0-9_./-]*)['"]?\s*:/
  // map each line of the new file to the protocol entry it sits in; an entry ends at the next line indented less than its key
  const lines = fs.readFileSync(path.join(repoRoot, file), 'utf8').split('\n')
  const keyAt = []
  let key, keyIndent
  lines.forEach((line, i) => {
    const indent = line.match(/^\s*/)[0].length
    const match = line.match(keyLine)
    if (match && allKeys.has(match[2]) && (key === undefined || match[1].length <= keyIndent)) {
      key = match[2]
      keyIndent = match[1].length
    } else if (key !== undefined && line.trim() && indent < keyIndent) key = undefined
    // a comment at key level sits between entries (usually describing the next one), not inside the current one
    const betweenEntries = key !== undefined && indent <= keyIndent && /^\s*(\/\/|\/\*|\*)/.test(line)
    keyAt[i + 1] = betweenEntries ? undefined : key
  })

  const touched = new Set()
  const addedKeys = new Set()
  const removedKeys = new Set()
  let diff = ''
  try {
    // -w: whitespace-only reformatting does not change an entry
    diff = execSync(`git diff -U0 -w ${diffBase} -- "${file}"`, { cwd: repoRoot }).toString()
  } catch (e) {
    console.error(`Failed to diff ${file}: ${e.message}`)
    return []
  }
  for (const hunk of diff.split(/^(?=@@ )/m).slice(1)) {
    const [, start, count = '1'] = hunk.match(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/)
    const hunkLines = hunk.split('\n')
    hunkLines.forEach(l => {
      const changedKey = l.slice(1).match(keyLine)?.[2]
      if (l.startsWith('+') && changedKey) addedKeys.add(changedKey)
      if (l.startsWith('-') && changedKey) removedKeys.add(changedKey)
    })
    if (+count === 0) {
      // pure deletion: skip a removed entry, otherwise it belongs to the entry around the line before it
      const removedEntry = hunkLines.some(l => l.startsWith('-') && allKeys.has(l.slice(1).match(keyLine)?.[2]))
      if (!removedEntry && keyAt[+start]) touched.add(keyAt[+start])
      continue
    }
    for (let l = +start; l < +start + +count; l++)
      // `}` -> `},` on the entry before an appended one is not an edit to it
      if (keyAt[l] && !/^\s*[}\])]+,?\s*$/.test(lines[l - 1])) touched.add(keyAt[l])
  }

  // new entries are always tested, edits inside existing entries are capped
  const isNew = key => addedKeys.has(key) && !removedKeys.has(key)
  const edited = [...touched].filter(key => !isNew(key))
  let keys = [...touched]
  if (edited.length > MAX_FACTORY_KEYS_PER_FILE) {
    console.error(`${file}: ${edited.length} existing entries changed, only testing new entries`)
    keys = keys.filter(isNew)
  }
  const result = []
  for (const key of keys)
    for (const { adapterType, protocolList } of factories)
      if (protocolList.has(key)) result.push(`${adapterType}@${key}`)
  return result
}

function parse(data) {
  return data.replace('[', '').replace(']', '').split(',')
}

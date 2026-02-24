import { readdir, writeFile, stat, mkdir, rename } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { ADAPTER_TYPES, AdapterType } from "../adapters/types";
import { setModuleDefaults } from "../adapters/utils/runAdapter";

const extensions = ['ts', 'md', 'js']
const baseFolderPath = __dirname + "/.."
const deadFolderPath = `${baseFolderPath}/dead`
const outputPath = `${baseFolderPath}/factory/deadAdapters.json`

// Load existing dead adapters if file exists
let deadAdapters: Record<string, Record<string, any>> = {}
if (existsSync(outputPath)) {
  try {
    deadAdapters = JSON.parse(readFileSync(outputPath, 'utf-8'))
  } catch (e) {
    deadAdapters = {}
  }
}

// Track which adapters have been moved
const movedAdapters = new Set<string>()

// Store dead adapter info for dependency resolution
interface DeadAdapterInfo {
  adapterType: string
  path: string
  fileKey: string
  fullPath: string
  // imports: string[] // list of imported adapter paths (e.g., "dexs/uniswap")
}
const deadAdapterInfos: Map<string, DeadAdapterInfo> = new Map()

function sortObjectByKey(obj: Record<string, any>) {
  return Object.keys(obj).sort().reduce((sorted: Record<string, any>, key) => {
    sorted[key] = obj[key]
    return sorted
  }, {})
}

function mockFunctions(obj: any): any {
  if (typeof obj === "function") {
    return '_f'
  } else if (typeof obj === "object" && obj !== null) {
    Object.keys(obj).forEach((key) => obj[key] = mockFunctions(obj[key]))
  }
  return obj
}

function removeDotTs(s: string) {
  const splitted = s.split('.')
  if (splitted.length > 1 && extensions.includes(splitted[splitted.length - 1]))
    splitted.pop()
  return splitted.join('.')
}

async function getDirectoriesAsync(source: string): Promise<string[]> {
  const dirents = await readdir(source, { withFileTypes: true });
  return dirents.map(dirent => dirent.name);
}

// Extract imports from file content
function extractImports(filePath: string): string[] {
  const imports: string[] = []
  try {
    let content: string
    const fileStat = existsSync(filePath) ? require('fs').statSync(filePath) : null
    if (fileStat?.isDirectory()) {
      const indexPath = `${filePath}/index.ts`
      if (!existsSync(indexPath)) return imports
      content = readFileSync(indexPath, 'utf-8')
    } else if (existsSync(filePath)) {
      content = readFileSync(filePath, 'utf-8')
    } else if (existsSync(filePath + '.ts')) {
      content = readFileSync(filePath + '.ts', 'utf-8')
    } else {
      return imports
    }

    // Match imports like: import ... from "../dexs/adapter-name"
    const importRegex = /from\s+["']\.\.\/([^"']+)["']/g
    let match
    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1]
      // Only track imports from adapter type folders
      for (const adapterType of ADAPTER_TYPES) {
        if (importPath.startsWith(adapterType + '/')) {
          imports.push(importPath)
          break
        }
      }
    }
  } catch (e) {
    // Ignore errors reading file
  }
  return imports
}

async function moveAdapter(info: DeadAdapterInfo): Promise<boolean> {
  const moduleKey = `${info.adapterType}/${info.fileKey}`

  if (movedAdapters.has(moduleKey)) {
    return false // Already moved
  }

  // First, move any dead dependencies -- no longer needed as there is no more breakdown adapters
  // for (const importPath of info.imports) {
  //   if (deadAdapterInfos.has(importPath) && !movedAdapters.has(importPath)) {
  //     const depInfo = deadAdapterInfos.get(importPath)!
  //     await moveAdapter(depInfo)
  //   }
  // }

  try {
    const importPath = `../${info.adapterType}/${info.fileKey}`
    let module = await import(importPath)
    if (!module.default) return false

    await setModuleDefaults(module.default)
    delete module.default._randomUID

    // Initialize adapter type in deadAdapters if not exists
    if (!deadAdapters[info.adapterType]) {
      deadAdapters[info.adapterType] = {}
    }

    const mockedModule = mockFunctions({ ...module.default })
    deadAdapters[info.adapterType][info.fileKey] = {
      modulePath: `-`,
      codePath: `dead/${info.adapterType}/${info.path}`,
      module: mockedModule
    }

    console.log(`Found dead adapter: ${moduleKey} (deadFrom: ${module.default.deadFrom})`)

    // Move to dead folder
    const deadTypeFolder = `${deadFolderPath}/${info.adapterType}`
    if (!existsSync(deadTypeFolder)) {
      await mkdir(deadTypeFolder, { recursive: true })
    }
    const destPath = `${deadTypeFolder}/${info.path}`
    await rename(info.fullPath, destPath)
    console.log(`  Moved to: ${destPath}`)

    movedAdapters.add(moduleKey)
    return true
  } catch (error: any) {
    console.log(error)
    // Skip modules that fail to import
  }
  return false
}

async function scanAdapter(adapterType: string, path: string): Promise<DeadAdapterInfo | null> {
  const excludeKeys = new Set(["index", "README", '.gitkeep'])
  if (excludeKeys.has(path)) return null

  try {
    const fileKey = removeDotTs(path)
    const moduleKey = `${adapterType}/${fileKey}`
    const importPath = `../${adapterType}/${fileKey}`
    const fullPath = `${baseFolderPath}/${adapterType}/${path}`

    let module = await import(importPath)
    if (!module.default) return null

    await setModuleDefaults(module.default)
    const adapterChainExports = Object.values(module.default.adapter || {})
    let allChainsAreDead = false
    if (adapterChainExports.length > 0 && adapterChainExports.every((chainExport: any) => chainExport.deadFrom))
      allChainsAreDead = true

    if (allChainsAreDead)
      console.log(`Scanned ${moduleKey}, all chains dead: ${allChainsAreDead}`)


    if (module.default.deadFrom !== undefined || allChainsAreDead) {
      // const imports = extractImports(fullPath)
      return {
        adapterType,
        path,
        fileKey,
        fullPath,
        // imports
      }
    }
  } catch (error: any) {
    // Skip modules that fail to import
  }
  return null
}

async function run() {
  // Phase 1: Scan all adapters and identify dead ones with their dependencies
  console.log('Scanning for dead adapters...\n')

  for (const adapterType of ADAPTER_TYPES) {
    if (adapterType === AdapterType.DERIVATIVES) {
      continue // skip derivatives as they use the same folder as dexs
    }

    const folderPath = `${baseFolderPath}/${adapterType}`

    try {
      const entries = await getDirectoriesAsync(folderPath)

      for (const entry of entries) {
        const info = await scanAdapter(adapterType, entry)
        if (info) {
          const moduleKey = `${info.adapterType}/${info.fileKey}`
          deadAdapterInfos.set(moduleKey, info)
        }
      }
    } catch (error) {
      // Folder doesn't exist, skip
    }
  }

  console.log(`Found ${deadAdapterInfos.size} dead adapters\n`)

  // Phase 2: Move adapters in dependency order
  let totalDead = 0
  for (const [_, info] of deadAdapterInfos) {
    const moved = await moveAdapter(info)
    if (moved) totalDead++
  }

  // Sort dead adapters by key
  for (const adapterType of Object.keys(deadAdapters)) {
    deadAdapters[adapterType] = sortObjectByKey(deadAdapters[adapterType])
  }
  deadAdapters = sortObjectByKey(deadAdapters)

  // Ensure the output directory exists
  const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/'))
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true })
  }

  await writeFile(outputPath, JSON.stringify(deadAdapters, null, 2))

  console.log(`\nWrote ${totalDead} dead adapters to ${outputPath}`)
  console.log(`Total dead adapters in registry: ${Object.values(deadAdapters).reduce((acc, obj) => acc + Object.keys(obj).length, 0)}`)

  process.exit(0)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})

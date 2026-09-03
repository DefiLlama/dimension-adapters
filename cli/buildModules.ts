// console.log("Building import files for tvl/dimensions/emissions/liquidations adapters")

import { execSync } from "child_process";
import { readdir, writeFile } from "fs/promises";
import { ADAPTER_TYPES, AdapterType, whitelistedBaseAdapterKeys } from "../adapters/types";
import { setModuleDefaults } from "../adapters/utils/runAdapter";
import { listHelperProtocols, deadAdapters } from "../factory/registry";

const extensions = ['ts', 'md', 'js']


run().catch(console.error).then(() => process.exit(0))

async function run() {
  const outputFile = __dirname + "/dimensionModules.json"



  const excludeKeys = new Set(["index", "README", '.gitkeep', 'GUIDELINES.md'])
  const baseFolderPath = __dirname + "/.." // path relative to current working directory -> `cd /defi`
  const dimensionsImports: any = {}

  for (const folderPath of ADAPTER_TYPES)
    await addAdapterType(folderPath)

  // Add helper-based adapters for all adapter types
  await addFactoryAdapters()
  addDeadAdapters()
  stampGitAddedInfo()

  await writeFile(outputFile, JSON.stringify(dimensionsImports))

  async function addAdapterType(folderPath: string) {
    if (folderPath === AdapterType.DERIVATIVES) {
      return; // skip derivatives as they use the same folder as dexs
    }

    dimensionsImports[folderPath] = {}

    try {
      const paths_keys = await getDirectoriesAsync(`${baseFolderPath}/${folderPath}`)
      // console.log(`Found ${paths_keys.length} adapters in ${folderPath}`)

      const promises = paths_keys.map(async (path) => {
        if (excludeKeys.has(path)) return;
        await createDimensionAdaptersModule(path, folderPath)
      })

      return Promise.all(promises)

    } catch (error) {
      console.error(`Error getting directories for ${folderPath}:`, error)
    }
  }

  async function addFactoryAdapters() {
    // Get all protocols from factory registry
    const factoryProtocols = listHelperProtocols();

    for (let { protocolName, factoryName, adapterType, sourcePath, exportName } of factoryProtocols) {
      if (!dimensionsImports[adapterType]) {
        dimensionsImports[adapterType] = {};
      }

      // Guard: Skip if file-based adapter already exists (file-based takes precedence)
      if (dimensionsImports[adapterType][protocolName]) {
        // console.log(`Skipping factory adapter ${protocolName} in ${adapterType} - file-based adapter already exists`);
        continue;
      }

      try {
        // Import based on source path
        if (sourcePath === 'users.ts')
          sourcePath = 'users/list.ts' // special case for users factory which has named exports
        let helperModule = sourcePath.startsWith('factory/')
          ? await import(`../${sourcePath.replace('.ts', '')}`)
          : sourcePath.includes('/') ? await import(`../${sourcePath}`) : await import(`../helpers/${factoryName}`);

        if (exportName) helperModule = helperModule[exportName];

        const adapter = helperModule.getAdapter(protocolName);

        if (adapter.adapter) {
          Object.keys(adapter.adapter).forEach(chain => {
            const obj = adapter.adapter[chain]
            const keys = Object.keys(obj)
            for (const key of keys) {
              if (!whitelistedBaseAdapterKeys.has(key)) {
                delete obj[key] // remove non base adapter keys to avoid confusion, we only want the fetch/start/runAtCurrTime keys for the dimension modules
              }
            }
          })
        }

        if (!adapter) continue;

        await setModuleDefaults(adapter);
        const mockedAdapter = mockFunctions({ default: adapter });

        dimensionsImports[adapterType][protocolName] = {
          moduleFilePath: `${adapterType}/${protocolName}`,
          codePath: sourcePath,
          module: mockedAdapter.default,
        };
      } catch (error: any) {
        console.log(`Error creating helper module for ${protocolName} from ${factoryName}:`, error.message);
      }
    }
  }

  async function createDimensionAdaptersModule(path: string, adapterType: string) {
    try {
      const fileKey = removeDotTs(path)
      const moduleFilePath = `${adapterType}/${fileKey}`
      const importPath = `../${adapterType}/${fileKey}`

      let module = await import(importPath)
      if (!module.default) {
        throw new Error(`Module ${moduleFilePath} does not have a default export`)
      }
      await setModuleDefaults(module.default)
      module = mockFunctions(module)
      dimensionsImports[adapterType][fileKey] = {
        moduleFilePath,
        codePath: `${adapterType}/${path}`,
        module: module.default,
      }
    } catch (error: any) {
      console.log(`Error creating module for ${path} in ${adapterType}:`, error.message)
      return ''
    }
  }

  // stamp each adapter with the commit that added its code file (addedCommit),
  // so consumers (born-to-llama bot) do not need a local clone for commit links
  function stampGitAddedInfo() {
    try {
      const { fileMap, dirMap } = getGitAddedInfo()
      for (const adapters of Object.values(dimensionsImports)) {
        for (const entry of Object.values(adapters as any)) {
          const codePath = (entry as any).codePath
          if (!codePath) continue
          // codePath is a file (dexs/uniswap.ts), a directory (dexs/uniswap)
          // or a bare helper name (aave.ts -> helpers/aave.ts or helpers/aave/)
          const commit = fileMap[codePath] ?? dirMap[codePath]
            ?? fileMap[`helpers/${codePath}`]
            ?? dirMap[`helpers/${String(codePath).replace(/\.(ts|js)$/, '')}`]
          if (commit) (entry as any).addedCommit = commit
        }
      }
    } catch (e) {
      console.error('Error stamping git added commit:', e)
    }
  }

  function addDeadAdapters() {

    const defaultCommitHash = "1e8620166b5772c02e5e68e9dcd2cbb818724d69"  // /dead folder is deleted after this step

    for (const [adapterType, adapters] of Object.entries(deadAdapters)) {
      if (!dimensionsImports[adapterType]) {
        dimensionsImports[adapterType] = {};
      }
      for (const [protocolName, adapterInfo] of Object.entries(adapters as any)) {
        if (dimensionsImports[adapterType][protocolName])
          continue;

        (adapterInfo as any).commit = (adapterInfo as any).commit ?? defaultCommitHash


        dimensionsImports[adapterType][protocolName] = adapterInfo;
      }
    }
  }
}

// walk git history once and map every file to the commit that added it
// fileMap: exact file path -> latest commit that added it (handles delete + re-add)
// dirMap: directory path -> commit that added the first file under it (adapter creation)
function getGitAddedInfo() {
  // --first-parent: walk only the mainline, so a file shows as added at the
  // commit or PR merge that landed it on master, never at a side-branch commit
  // --no-renames: files moved into place still show as added instead of renamed
  const output = execSync('git log --first-parent --no-renames --format="%H|" --name-only --diff-filter=A', { maxBuffer: 1024 * 1024 * 512, cwd: __dirname + '/..' }).toString()

  const fileMap: Record<string, string> = {}
  const dirMap: Record<string, string> = {}
  let commit = ''
  for (const line of output.split('\n')) {
    if (!line) continue
    if (line.length === 41 && line[40] === '|' && /^[0-9a-f]{40}$/.test(line.slice(0, 40))) {
      commit = line.slice(0, 40)
    } else if (commit) {
      // log is newest-first, first occurrence = latest commit that added this path
      if (!fileMap[line]) fileMap[line] = commit
      // keep overwriting ancestor dirs: the last write is the oldest file addition
      const parts = line.split('/')
      parts.pop()
      let dir = ''
      for (const part of parts) {
        dir = dir ? `${dir}/${part}` : part
        dirMap[dir] = commit
      }
    }
  }
  return { fileMap, dirMap }
}

//Replace all fuctions with mock functions in an object all the way down
function mockFunctions(obj: any) {
  if (typeof obj === "function") {
    return '_f'  // llamaMockedTVLFunction
  } else if (typeof obj === "bigint") {
    return Number(obj)
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

// Async version of getDirectories
async function getDirectoriesAsync(source: string): Promise<string[]> {
  try {
    const dirents = await readdir(source, { withFileTypes: true });
    return dirents.map(dirent => dirent.name);
  } catch (error) {
    let sourceDir = source.split('/').pop() || source;
    if (!['nft-volume', 'active-users', 'new-users'].includes(sourceDir)) {
      console.log(`Error reading directories from ${sourceDir}:`, (error as any).message);
    }
    return [];
  }
}

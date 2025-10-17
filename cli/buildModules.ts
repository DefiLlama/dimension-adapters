// console.log("Building import files for tvl/dimensions/emissions/liquidations adapters")

import { readdir, writeFile } from "fs/promises";
import { ADAPTER_TYPES, AdapterType } from "../adapters/types";
import { setModuleDefaults } from "../adapters/utils/runAdapter";

const extensions = ['ts', 'md', 'js']


run().catch(console.error).then(() => process.exit(0))

async function run() {
  const outputFile = __dirname + "/dimensionModules.json"



  const excludeKeys = new Set(["index", "README", '.gitkeep'])
  const baseFolderPath = __dirname + "/.." // path relative to current working directory -> `cd /defi`
  const dimensionsImports: any = {}

  for (const folderPath of ADAPTER_TYPES)
    await addAdapterType(folderPath)


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

  async function createDimensionAdaptersModule(path: string, adapterType: string) {
    try {
      const fileKey = removeDotTs(path)
      const moduleFilePath = `${adapterType}/${fileKey}`
      const importPath = `../${adapterType}/${fileKey}`

      let module = await import(importPath)
      if (!module.default) {
        throw new Error(`Module ${moduleFilePath} does not have a default export`)
      }
      setModuleDefaults(module.default)
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
}

//Replace all fuctions with mock functions in an object all the way down
function mockFunctions(obj: any) {
  if (typeof obj === "function") {
    return '_f'  // llamaMockedTVLFunction
  } else if (typeof obj === "object") {
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
  const dirents = await readdir(source, { withFileTypes: true });
  return dirents.map(dirent => dirent.name);
}

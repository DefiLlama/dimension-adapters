import * as path from 'path'
import type { Adapter, BaseAdapter, ChainBlocks } from '../dexVolume.type';
import { chainsForBlocks } from "@defillama/sdk/build/computeTVL/blocks";
import { Chain } from '@defillama/sdk/build/general';
import { checkArguments, ERROR_STRING, formatTimestampAsDate, printVolumes, upperCaseFirst } from './utils';
import { getBlock } from '../helper/getBlock';
import { getUniqStartOfTodayTimestamp } from '../helper/getUniSubgraphVolume';
require('dotenv').config()

// tmp
const handleError = (e) => console.error(e)

// Add handler to rejections/exceptions
process.on('unhandledRejection', handleError)
process.on('uncaughtException', handleError)

// Check if all arguments are present
checkArguments(process.argv)

enum AdapterType {
  FEES = 'fees',
  VOLUME = 'volume'
}

const getFolderByAdapterType = (adapterType: AdapterType) => adapterType === AdapterType.VOLUME ? 'volumes' : adapterType

// Get path of module import
const adapterType: AdapterType = process.argv[2] as AdapterType
const passedFile = path.resolve(process.cwd(), `./${getFolderByAdapterType(adapterType)}/${process.argv[3]}`);
(async () => {
  try {
    console.info(`🦙 Running ${process.argv[3].toUpperCase()} adapter 🦙`)
    console.info(`_______________________________________`)
    // Import module to test
    let module: Adapter = (await import(passedFile)).default
    getUniqStartOfTodayTimestamp
    const unixTimestamp = +process.argv[3] || getUniqStartOfTodayTimestamp(new Date()) - 1;
    console.info(`${upperCaseFirst(adapterType)} for ${formatTimestampAsDate(String(unixTimestamp))}`)
    console.info(`_______________________________________\n`)
    if ("volume" in module || "fees" in module) {
      const adapter = "volume" in module ? module.volume : module.fees
      // Get adapter
      const volumes = await runAdapter(adapter, unixTimestamp)
      printVolumes(volumes)
      console.info("\n")
    } else if ("breakdown" in module) {
      const breakdownAdapter = module.breakdown
      const allVolumes = await Promise.all(Object.entries(breakdownAdapter).map(async ([version, adapter]) =>
        await runAdapter(adapter, unixTimestamp).then(res => ({ version, res }))
      ))
      allVolumes.forEach((promise) => {
        console.info("Version ->", promise.version.toUpperCase())
        console.info("---------")
        printVolumes(promise.res)
        console.info("\n")
      })
    } else throw new Error("No compatible adapter found")
  } catch (error) {
    console.error(ERROR_STRING)
    console.error(error)
  }
})()

async function runAdapter(volumeAdapter: BaseAdapter, timestamp: number) {
  // Get chains to check
  const chains: Chain[] = Object.keys(volumeAdapter).filter(item => typeof volumeAdapter[item] === 'object').map(c => c === "ava" ? "avax" : c as Chain)
  // Get lastest block 
  const chainBlocks: ChainBlocks = {};
  await Promise.all(
    chains.map(async (chain) => {
      if (chainsForBlocks.includes(chain as Chain) || chain === "ethereum") {
        const latestBlock = await getBlock(timestamp, chain, chainBlocks)
        if (latestBlock)
          chainBlocks[chain] = latestBlock - 15
      }
    })
  );
  // Get volumes
  const volumes = await Promise.all(chains.map(
    async chain => {
      const startTimestamp = await volumeAdapter[chain].start()
      const fetchVolumeFunc = volumeAdapter[chain].customBackfill ?? volumeAdapter[chain].fetch
      return fetchVolumeFunc(timestamp, chainBlocks)
        .then(res => ({ timestamp: res.timestamp, [`total${upperCaseFirst(adapterType)}`]: res[`total${upperCaseFirst(adapterType)}`], [`daily${upperCaseFirst(adapterType)}`]: res[`daily${upperCaseFirst(adapterType)}`], chain, startTimestamp })).catch(e => {
          throw new Error(`${process.argv[2]} ${timestamp}, ${chainBlocks} ${chain} ${e.message}`)
        })
    }
  ))
  return volumes
}
require('dotenv').config()
import * as path from 'path'
import { Adapter, AdapterType, ChainBlocks, } from '../adapters/types';
import { checkArguments, ERROR_STRING, formatTimestampAsDate, printVolumes, upperCaseFirst } from './utils';
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume';
import runAdapter from '../adapters/utils/runAdapter'
import { canGetBlock, getBlock } from '../helpers/getBlock';
import getChainsFromDexAdapter from '../adapters/utils/getChainsFromDexAdapter';

// tmp
const handleError = (e: Error) => console.error(e)

// Add handler to rejections/exceptions
process.on('unhandledRejection', handleError)
process.on('uncaughtException', handleError)

// Check if all arguments are present
checkArguments(process.argv)

function getTimestamp30MinutesAgo() {
  return Math.trunc(Date.now() / 1000) - 60 * 30
}

// Get path of module import
const adapterType: AdapterType = process.argv[2] as AdapterType
const passedFile = path.resolve(process.cwd(), `./${adapterType}/${process.argv[3]}`);
(async () => {
  const cleanDayTimestamp = process.argv[4] ? Number(process.argv[4]) : getUniqStartOfTodayTimestamp(new Date())
  let endCleanDayTimestamp = cleanDayTimestamp;
  console.info(`🦙 Running ${process.argv[3].toUpperCase()} adapter 🦙`)
  console.info(`_______________________________________`)
  // Import module to test
  let module: Adapter = (await import(passedFile)).default
  const adapterVersion = module.version
  let endTimestamp = endCleanDayTimestamp
  if (adapterVersion === 2) {
    endTimestamp = (process.argv[4] ? Number(process.argv[4]) : getTimestamp30MinutesAgo()) // 1 day;
  }

  const runAt = adapterVersion === 2 ? endTimestamp : process.argv[4] ?  Number(process.argv[4]) : endTimestamp - 1;
  console.info(`${upperCaseFirst(adapterType)} for ${formatTimestampAsDate(String(getUniqStartOfTodayTimestamp(new Date((runAt * 1000)))))}`)
  console.info(`_______________________________________\n`)

  // Get closest block to clean day. Only for EVM compatible ones.
  const allChains = getChainsFromDexAdapter(module).filter(canGetBlock)

  const chainBlocks: ChainBlocks = {};
  await Promise.all(allChains.map(async (chain) => {
    try {
      const latestBlock = await getBlock(endTimestamp, chain, chainBlocks).catch((e: any) => console.error(`${e.message}; ${endTimestamp}, ${chain}`))
      if (latestBlock)
        chainBlocks[chain] = latestBlock
    } catch (e) { console.log(e) }
  }))

  if ("adapter" in module) {
    const adapter = module.adapter
    // Get adapter
    const volumes = await runAdapter(adapter, endTimestamp, chainBlocks, undefined, undefined, {
      adapterVersion,
    })
    printVolumes(volumes, adapter)
    console.info("\n")
  } else if ("breakdown" in module) {
    const breakdownAdapter = module.breakdown
    const allVolumes = await Promise.all(Object.entries(breakdownAdapter).map(([version, adapter]) =>
      runAdapter(adapter, endTimestamp, chainBlocks, undefined, undefined, {
        adapterVersion,
      }).then(res => ({ version, res }))
    ))
    allVolumes.forEach(({ version, res }) => {
      console.info("Version ->", version.toUpperCase())
      console.info("---------")
      printVolumes(res, breakdownAdapter[version])
    })
  } else throw new Error("No compatible adapter found")
  process.exit(0)
})()

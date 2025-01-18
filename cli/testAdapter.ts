require('dotenv').config()
import { execSync } from 'child_process';
import * as path from 'path';
import { Adapter, AdapterType, ChainBlocks, } from '../adapters/types';
import getChainsFromDexAdapter from '../adapters/utils/getChainsFromDexAdapter';
import runAdapter from '../adapters/utils/runAdapter';
import { canGetBlock, getBlock } from '../helpers/getBlock';
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume';
import { checkArguments, printVolumes } from './utils';

function checkIfFileExistsInMasterBranch(_filePath: any) {
  const res = execSync(`git ls-tree --name-only -r master`)

  // const resString = res.toString()
  // if (!resString.includes(filePath)) {
  //   console.log("\n\n\nERROR: Use Adapter v2 format for new adapters\n\n\n")
  //   process.exit(1)
  // }
}

// tmp
const handleError = (e: Error) => console.error(e)

// Add handler to rejections/exceptions
process.on('unhandledRejection', handleError)
process.on('uncaughtException', handleError)

// Check if all arguments are present
checkArguments(process.argv)

function getTimestamp30MinutesAgo() {
  return Math.trunc(Date.now() / 1000) - 60 * 60 * 2.5
}


function toTimestamp(timeArg:string){
  if(Number.isNaN(Number(timeArg))){
    return Math.round(new Date(timeArg).getTime()/1e3)
  } else {
    return Number(timeArg)
  }
}

// Get path of module import
const adapterType: AdapterType = process.argv[2] as AdapterType
const file = `${adapterType}/${process.argv[3]}`

const passedFile = path.resolve(process.cwd(), `./${adapterType}/${process.argv[3]}`);
(async () => {

  const cleanDayTimestamp = process.argv[4] ? toTimestamp(process.argv[4]) : getUniqStartOfTodayTimestamp(new Date())
  let endCleanDayTimestamp = cleanDayTimestamp;
  console.info(`🦙 Running ${process.argv[3].toUpperCase()} adapter 🦙`)
  console.info(`---------------------------------------------------`)
  // Import module to test
  let module: Adapter = (await import(passedFile)).default
  const adapterVersion = module.version
  let endTimestamp = endCleanDayTimestamp
  if (adapterVersion === 2) {
    endTimestamp = (process.argv[4] ? toTimestamp(process.argv[4]) : getTimestamp30MinutesAgo()) // 1 day;
  } else {
    checkIfFileExistsInMasterBranch(file)
  }

  console.info(`Start Date:\t${new Date((endTimestamp - 3600*24)*1e3).toUTCString()}`)
  console.info(`End Date:\t${new Date(endTimestamp*1e3).toUTCString()}`)
  console.info(`---------------------------------------------------\n`)

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
    console.log(volumes);
    printVolumes(volumes, adapter)
    console.info("\n")
  } else if ("breakdown" in module) {
    const breakdownAdapter = module.breakdown
    const allVolumes = await Promise.all(Object.entries(breakdownAdapter).map(([version, adapter]) =>
      runAdapter(adapter, endTimestamp, chainBlocks, undefined, undefined, {
        adapterVersion,
        isTest: true,
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

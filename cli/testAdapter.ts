require('dotenv').config()
import { execSync } from 'child_process';
import * as path from 'path';
import { AdapterType, BreakdownAdapter, SimpleAdapter, } from '../adapters/types';
import runAdapter from '../adapters/utils/runAdapter';
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume';
import { checkArguments, ERROR_STRING, printBreakdownFeesByLabel, printVolumes2, timestampLast } from './utils';
import { importAdapter } from '../adapters/utils/importAdapter';

function checkIfFileExistsInMasterBranch(filePath: any) {
  const res = execSync(`git ls-tree --name-only -r master`)

  const resString = res.toString()
  if (!resString.includes(filePath)) {
    console.log("\n\n\nERROR: Use Adapter v2 format for new adapters\n\n\n")
    process.exit(1)
  }
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


function toTimestamp(timeArg: string) {
  if (Number.isNaN(Number(timeArg))) {
    return Math.round(new Date(timeArg).getTime() / 1e3)
  } else {
    return Number(timeArg)
  }
}

// Get path of module import
const adapterType: AdapterType | string = process.argv[2] as AdapterType
const moduleArg = process.argv[3]

let adapterModule: SimpleAdapter;
let usedHelper: string | null | undefined = null;

(async () => {
  const file = `${adapterType}/${moduleArg}`
  const passedFile = path.resolve(process.cwd(), `./${file}`);
  
  // throw error if module doesnt start with lowercase letters
  if (!/^[a-z0-9]/.test(moduleArg)) {
    throw new Error("Module name should start with a lowercase letter: " + moduleArg);
  }
  
  try {
    const result = await importAdapter(adapterType, moduleArg, passedFile);
    adapterModule = result.adapter;
    
    if (result.source === 'factory') {
      usedHelper = result.factoryName;
      console.info(`🦙 Running ${moduleArg.toUpperCase()} adapter from ${usedHelper} factory 🦙`);
    } else {
      console.info(`🦙 Running ${moduleArg.toUpperCase()} adapter 🦙`);
    }
  } catch (error: any) {
    console.error(error.message);
    process.exit(1);
  }
  
  console.info(`---------------------------------------------------`)

  const cleanDayTimestamp = process.argv[4] ? toTimestamp(process.argv[4]) : getUniqStartOfTodayTimestamp(new Date())
  let endCleanDayTimestamp = cleanDayTimestamp;
  
  const adapterVersion = adapterModule.version
  let endTimestamp = endCleanDayTimestamp
  if (adapterVersion === 2) {
    endTimestamp = (process.argv[4] ? toTimestamp(process.argv[4]) : getTimestamp30MinutesAgo()) // 1 day;
  }

  console.info(`Start Date:\t${new Date((endTimestamp - 3600 * 24) * 1e3).toUTCString()}`)
  console.info(`End Date:\t${new Date(endTimestamp * 1e3).toUTCString()}`)
  console.info(`---------------------------------------------------\n`)

  if ((adapterModule as BreakdownAdapter).breakdown) throw new Error('Breakdown adapters are deprecated, migrate it to use simple adapter')
  // Get adapter
  const debugBreakdownFees = Boolean(process.env.DEBUG_BREAKDOWN_FEES)
  const volumes: any = await runAdapter({ 
    module: adapterModule, 
    endTimestamp, 
    withMetadata: debugBreakdownFees, 
    isTest: true,
    name: usedHelper ? `${adapterType}/${moduleArg} (from ${usedHelper})` : moduleArg
  })
  
  if (debugBreakdownFees) {
    printVolumes2(volumes.response.map((volume: any) => timestampLast(volume)))
    printBreakdownFeesByLabel(volumes.adaptorRecordV2JSON.breakdownByLabel)
  } else {
    printVolumes2(volumes.map((volume: any) => timestampLast(volume)))
  }

  console.info("\n")
  process.exit(0)
})().catch((e) => {
  console.log(ERROR_STRING)
  console.error(e.stack?.split('\n')?.slice(0, 3)?.join('\n'))
  console.log(e.message ?? e)
  process.exit(1)
})

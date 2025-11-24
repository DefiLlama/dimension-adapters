require('dotenv').config()
import { execSync } from 'child_process';
import * as path from 'path';
import { AdapterType, BreakdownAdapter, SimpleAdapter, } from '../adapters/types';
import runAdapter from '../adapters/utils/runAdapter';
import { getUniqStartOfTodayTimestamp } from '../helpers/getUniSubgraphVolume';
import { checkArguments, printVolumes2, timestampLast } from './utils';

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
const adapterType: AdapterType = process.argv[2] as AdapterType
const file = `${adapterType}/${process.argv[3]}`

const passedFile = path.resolve(process.cwd(), `./${adapterType}/${process.argv[3]}`);
(async () => {


  const moduleArg = process.argv[3]

  // throw error if module doesnt start with lowercase letters
  if (!/^[a-z]/.test(moduleArg)) {
    throw new Error("Module name should start with a lowercase letter: " + moduleArg);
  }

  const cleanDayTimestamp = process.argv[4] ? toTimestamp(process.argv[4]) : getUniqStartOfTodayTimestamp(new Date())
  let endCleanDayTimestamp = cleanDayTimestamp;
  console.info(`🦙 Running ${process.argv[3].toUpperCase()} adapter 🦙`)
  console.info(`---------------------------------------------------`)
  // Import module to test
  let module: SimpleAdapter = (await import(passedFile)).default
  const adapterVersion = module.version
  let endTimestamp = endCleanDayTimestamp
  if (adapterVersion === 2) {
    endTimestamp = (process.argv[4] ? toTimestamp(process.argv[4]) : getTimestamp30MinutesAgo()) // 1 day;
  } else {
    // checkIfFileExistsInMasterBranch(file)
  }

  console.info(`Start Date:\t${new Date((endTimestamp - 3600 * 24) * 1e3).toUTCString()}`)
  console.info(`End Date:\t${new Date(endTimestamp * 1e3).toUTCString()}`)
  console.info(`---------------------------------------------------\n`)

  if ((module as BreakdownAdapter).breakdown) throw new Error('Breakdown adapters are deprecated, migrate it to use simple adapter')
  // Get adapter
  const volumes: any = await runAdapter({ module, endTimestamp })
  printVolumes2(volumes.map((volume: any) => timestampLast(volume)))
  console.info("\n")
  process.exit(0)
})()

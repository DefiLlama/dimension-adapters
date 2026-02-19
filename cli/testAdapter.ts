require('dotenv').config()
import { execSync } from 'child_process';
import * as path from 'path';
import { AdapterType, BreakdownAdapter, SimpleAdapter, } from '../adapters/types';
import runAdapter, { isHourlyAdapter, isPlainDateArg } from '../adapters/utils/runAdapter';
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

  const rawTimeArg = process.argv[4]
  const cleanDayTimestamp = rawTimeArg ? toTimestamp(rawTimeArg) : getUniqStartOfTodayTimestamp(new Date())
  let endCleanDayTimestamp = cleanDayTimestamp;
  // console.info(`🦙 Running ${process.argv[3].toUpperCase()} adapter 🦙`)
  // console.info(`---------------------------------------------------`)
  // Import module to test
  let module: SimpleAdapter = adapterModule
  const adapterVersion = module.version
  const isHourly = isHourlyAdapter(module)
  const isPlainDate = isPlainDateArg(rawTimeArg)

  function mergeAggregated(target: any, source: any) {
    if (!source) return
    for (const [metric, data] of Object.entries(source)) {
      const src = data as any
      if (!target[metric]) target[metric] = { value: 0, chains: {} as any }
      const dst = target[metric]
      dst.value += src.value || 0
      if (src.chains) {
        for (const [chain, val] of Object.entries(src.chains)) {
          if (val === undefined || val === null) continue
          dst.chains[chain] = (dst.chains[chain] || 0) + (val as number)
        }
      }
    }
  }


  if (isHourly && !rawTimeArg) {
    const rollingEnd = getTimestamp30MinutesAgo()
    const rollingEndSafe = rollingEnd - (rollingEnd % (60 * 60))
    const rollingStart = rollingEndSafe - 24 * 60 * 60

    console.info(`Start Date:\t${new Date(rollingStart * 1e3).toUTCString()}`)
    console.info(`End Date:\t${new Date(rollingEndSafe * 1e3).toUTCString()}`)
    console.info(`---------------------------------------------------\n`)

    const dayStart = rollingStart
    const lastHour = 23

    await runHourlyMultiSlot(dayStart, lastHour)
    process.exit(0)
  }

  if (isHourly && isPlainDate) {
    const endOfWindow = toTimestamp(rawTimeArg)       // 2025-12-09 00:00:00
    const dayStart = endOfWindow - 24 * 60 * 60       // 2025-12-08 00:00:00

    console.info(`Start Date:\t${new Date(dayStart * 1e3).toUTCString()}`)
    console.info(`End Date:\t${new Date(endOfWindow * 1e3).toUTCString()}`)
    console.info(`---------------------------------------------------\n`)

    await runHourlyMultiSlot(dayStart, 23)
    process.exit(0)
  }

  let endTimestamp = endCleanDayTimestamp
  if (adapterVersion === 2) {
    endTimestamp = (rawTimeArg ? toTimestamp(rawTimeArg) : getTimestamp30MinutesAgo()) // 1 day;
  } else {
    // checkIfFileExistsInMasterBranch(file)
  }

  const windowSeconds = isHourly ? 60 * 60 : 3600 * 24

  console.info(`Start Date:\t${new Date((endTimestamp - windowSeconds) * 1e3).toUTCString()}`)
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

  async function runHourlyMultiSlot(dayStart: number, lastHour: number) {

    if ((module as BreakdownAdapter).breakdown) throw new Error('Breakdown adapters are deprecated, migrate it to use simple adapter')

    const dailyByChain: Record<string, Record<string, number>> = {}
    const aggregatedDaily: any = {}
    const jobs: { hour: number, startTimestamp: number, endTimestamp: number }[] = []

    for (let hour = 0; hour <= lastHour; hour++) {
      const endTimestamp = dayStart + (hour + 1) * 3600
      const startTimestamp = endTimestamp - 3600
      jobs.push({ hour, startTimestamp, endTimestamp })
    }

    const MAX_PARALLEL = 2

    for (let i = 0; i < jobs.length; i += MAX_PARALLEL) {
      const batch = jobs.slice(i, i + MAX_PARALLEL)

      const results = await Promise.all(
        batch.map(job => runAdapter({ module, endTimestamp: job.endTimestamp, withMetadata: true, runWindowInSeconds: 60 * 60 }))
      )

      results.forEach((res: any, idx) => {
        const job = batch[idx]
        const { startTimestamp, endTimestamp, hour } = job

        const volumes = res.response
        const adaptorRecordV2JSON = res.adaptorRecordV2JSON
        const aggHour = adaptorRecordV2JSON?.aggregated

        console.info(`Slice ${hour}:`)
        console.info(`Start Date:\t${new Date(startTimestamp * 1e3).toUTCString()}`)
        console.info(`End Date:\t${new Date(endTimestamp * 1e3).toUTCString()}`)
        console.info(`---------------------------------------------------\n`)

        const lastPerChain = volumes.map((volume: any) => timestampLast(volume))

        printVolumes2(lastPerChain)

        for (const row of lastPerChain) {
          const chain = (row as any).chain
          if (!chain) continue

          if (!dailyByChain[chain]) dailyByChain[chain] = {}
          const agg = dailyByChain[chain]

          for (const [key, value] of Object.entries(row as any)) {
            if (key === 'chain' || key === 'timestamp' || key === 'startTimestamp') continue
            if (typeof value !== 'number') continue
            agg[key] = (agg[key] ?? 0) + value
          }
        }

        mergeAggregated(aggregatedDaily, aggHour)
      })
    }

    const dailyRows = Object.entries(dailyByChain).map(([chain, metrics]) => ({
      chain,
      timestamp: dayStart + (lastHour + 1) * 3600 - 1,
      ...metrics,
    }))

    console.info(`\n====== TOTAL DAILY AGGREGATED (sum of slots per chain) ======\n`)
    printVolumes2(dailyRows)
  }
  
})().catch((e) => {
  console.log(ERROR_STRING)
  console.error(e.stack?.split('\n')?.slice(0, 3)?.join('\n'))
  console.log(e.message ?? e)
  process.exit(1)
})

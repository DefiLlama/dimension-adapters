import * as sdk from '@defillama/sdk';
import { Balances, ChainApi, elastic, getEventLogs, getProvider } from '@defillama/sdk';
import * as _env from '../../helpers/env';
import { getBlock } from "../../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphFees';
import { getDateString } from '../../helpers/utils';
import { accumulativeKeySet, BaseAdapter, BaseAdapterChainConfig, ChainBlocks, Fetch, FetchGetLogsOptions, FetchOptions, FetchResponseValue, FetchResultV2, FetchV2, SimpleAdapter, } from '../types';

// to trigger inclusion of the env.ts file
const _include_env = _env.getEnv('BITLAYER_RPC')

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

function getUnixTimeNow() {
  return Math.floor(Date.now() / 1000)
}

function genUID(length: number = 10): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length))
  }
  return result
}

const adapterRunResponseCache = {} as any

export async function setModuleDefaults(module: SimpleAdapter) {
  const { chains = [], fetch, start, runAtCurrTime } = module
  const rootConfig: any = {}

  if (fetch) rootConfig.fetch = fetch
  if (start) rootConfig.start = start
  if (runAtCurrTime) rootConfig.runAtCurrTime = runAtCurrTime

  if (!module._randomUID) module._randomUID = genUID(10)

  let adapterObject: BaseAdapter = module.adapter || {}
  module.adapter = adapterObject

  if (!module.version) module.version = 1 // default to version 1
  module.runAtCurrTime = runAtCurrTime ?? Object.values(adapterObject).some((c: BaseAdapterChainConfig) => c.runAtCurrTime)

  if (!Array.isArray(chains))
    throw new Error(`Chains should be an array, got ${typeof chains} instead`)

  Object.keys(adapterObject).filter(chain => !chains.includes(chain)).forEach(chain => chains.push(chain))

  for (const cConfig of chains) {

    if (typeof cConfig === 'string') {
      setChainConfig(cConfig, rootConfig)
    } else if (Array.isArray(cConfig)) {
      const [chain, chainConfig] = cConfig
      if (typeof chain !== 'string' || typeof chainConfig !== 'object')
        throw new Error(`Invalid chain config: ${cConfig}`)
      setChainConfig(chain, { ...rootConfig, ...chainConfig })
    } else {
      throw new Error(`Invalid chain config: ${cConfig}`)
    }
  }

  // check if chain already has a given field before setting it, so we dont end up overwriting it with defaults
  function setChainConfig(chain: string, config: BaseAdapterChainConfig) {
    if (!adapterObject[chain]) adapterObject[chain] = {}
    const chainConfigObject = adapterObject[chain] as BaseAdapterChainConfig

    for (const key of Object.keys(config)) {
      if (!chainConfigObject.hasOwnProperty(key))
        (chainConfigObject as any)[key] = (config as any)[key]
    }
  }

}

type AdapterRunOptions = {
  module: SimpleAdapter,
  endTimestamp: number,
  name?: string,
  isTest?: boolean, // we print run response to console in test mode
  withMetadata?: boolean, // if true, returns metadata with the response
  cacheResults?: boolean, // if true, caches the results in adapterRunResponseCache
}

export default async function runAdapter(options: AdapterRunOptions) {
  const { module, cacheResults = false } = options
  if (!module) throw new Error('Module is not set')

  setModuleDefaults(module)

  if (!cacheResults) return _runAdapter(options)

  const runKey = getRunKey(options)

  if (!adapterRunResponseCache[runKey]) adapterRunResponseCache[runKey] = _runAdapter(options)
  else sdk.log(`[Dimensions run] Using cached results for ${runKey}`)
  return adapterRunResponseCache[runKey]
}

function getRunKey(options: AdapterRunOptions) {
  let randomUID = options.module._randomUID ?? genUID(10)
  return `${randomUID}-${options.endTimestamp}-${options.withMetadata}`
}


async function _runAdapter({
  module, endTimestamp, name,
  isTest = false,
  withMetadata = false,
}: AdapterRunOptions) {
  const cleanCurrentDayTimestamp = endTimestamp
  const adapterVersion = module.version

  const chainBlocks: ChainBlocks = {} // we need it as it is used in the v1 adapters
  const { prefetch, allowNegativeValue = false, } = module
  let adapterObject = module.adapter
  if (!adapterObject)
    throw new Error('Adapter object is not set')

  if ((module as any).breakdown) throw new Error('Breakdown adapters are deprecated, migrate it to use simple adapter')
  const closeToCurrentTime = Math.trunc(Date.now() / 1000) - cleanCurrentDayTimestamp < 24 * 60 * 60 // 12 hours
  const chains = Object.keys(adapterObject)
  if (chains.some(c => !c) || chains.includes('undefined')) {
    throw new Error(`Invalid chain labels: ${chains.filter(c => !c || c === 'undefined').join(', ')}`)
  }

  const badChainNames = chains.filter(chain => !/^[a-z0-9_]+$/.test(chain));
  if (badChainNames.length) {
    throw new Error(`
    Invalid chain names: ${badChainNames.join(', ')}
    Chain names should only contain lowercase letters, numbers and underscores
    `)
  }
  
  const validStart = {} as {
    [chain: string]: {
      canRun: boolean,
      startTimestamp: number
    }
  }
  await Promise.all(chains.map(setChainValidStart))

  // Run prefetch if provided
  let preFetchedResults: any = null;
  if (typeof prefetch === 'function') {
    const firstChain = chains.find(chain => validStart[chain]?.canRun);
    if (firstChain) {
      const options = await getOptionsObject(cleanCurrentDayTimestamp, firstChain, chainBlocks);
      preFetchedResults = await prefetch(options);
    }
  }

  const aggregated = {} as any
  let breakdownByToken: any = {}
  let breakdownByLabelByChain: any = {}
  let breakdownByLabel: any = {}

  const response = await Promise.all(chains.filter(chain => {
    const res = validStart[chain]?.canRun
    if (isTest && !res) console.log(`Skipping ${chain} because the configured start time is ${new Date(validStart[chain]?.startTimestamp * 1e3).toUTCString()} \n\n`)
    return validStart[chain]?.canRun
  }).map(getChainResult))

  Object.entries(breakdownByToken).forEach(([chain, data]: any) => {
    if (typeof data !== 'object' || data === null || !Object.keys(data).length) delete breakdownByToken[chain]
  })

  if (Object.keys(breakdownByToken).length === 0) breakdownByToken = undefined
  if (Object.keys(breakdownByLabel).length === 0) breakdownByLabel = undefined
  if (Object.keys(breakdownByLabelByChain).length === 0) breakdownByLabelByChain = undefined


  const adaptorRecordV2JSON: any = {
    aggregated,
    breakdownByLabel,
    breakdownByLabelByChain,
    timestamp: response.find(i => i?.timestamp)?.timestamp
  }


  if (withMetadata) return { response, adaptorRecordV2JSON, breakdownByToken }
  return response

  async function getChainResult(chain: string) {
    const startTime = getUnixTimeNow()
    const metadata = {
      application: "dimensions",
      type: 'protocol-chain',
      name,
      chain,
      version: adapterVersion,
    }

    const fetchFunction = adapterObject![chain].fetch
    try {
      const options = await getOptionsObject(cleanCurrentDayTimestamp, chain, chainBlocks)
      if (preFetchedResults !== null) {
        options.preFetchedResults = preFetchedResults;
      }

      let result: any
      if (adapterVersion === 1) {
        result = await (fetchFunction as Fetch)(options.toTimestamp, chainBlocks, options);
      } else if (adapterVersion === 2) {
        result = await (fetchFunction as FetchV2)(options);
        result.timestamp = options.toTimestamp
      } else {
        throw new Error(`Adapter version ${adapterVersion} not supported`)
      }
      const ignoreKeys = ['timestamp', 'block']
      const improbableValue = 2e11 // 200 billion

      // validate and inject missing record if any
      validateAdapterResult(result)

      // add missing metrics if need
      addMissingMetrics(chain, result)

      for (const [recordType, value] of Object.entries(result)) {
        if (ignoreKeys.includes(recordType)) continue;
        if (value === undefined || value === null) { // dont store undefined or null values
          delete result[recordType]
          continue;
        }
        // if (value === undefined || value === null) throw new Error(`Value: ${value} ${recordType} is undefined or null`)
        if (value instanceof Balances) {
          const { labelBreakdown, usdTvl, usdTokenBalances, rawTokenBalances } = await value.getUSDJSONs()
          result[recordType] = usdTvl
          breakdownByToken[chain] = breakdownByToken[chain] || {}
          breakdownByToken[chain][recordType] = { usdTvl, usdTokenBalances, rawTokenBalances }

          if (labelBreakdown) {
            if (!breakdownByLabel[recordType]) breakdownByLabel[recordType] = {}
            if (!breakdownByLabelByChain[recordType]) breakdownByLabelByChain[recordType] = {}

            const aggData = breakdownByLabel[recordType]
            const breakData = breakdownByLabelByChain[recordType]

            for (let [label, labelValue] of Object.entries(labelBreakdown)) {
              labelValue = +Number(labelValue).toFixed(0)  // ensure labelValue is rounded to integer
              aggData[label] = (aggData[label] || 0) + labelValue
              if (!breakData[label]) breakData[label] = {}
              breakData[label][chain] = labelValue
            }
          }
        }

        result[recordType] = +Number(result[recordType]).toFixed(0)
        if (!aggregated[recordType]) aggregated[recordType] = { value: 0, chains: {} }
        aggregated[recordType].value += result[recordType]
        aggregated[recordType].chains[chain] = result[recordType]

        let errorPartialString = `| ${chain}-${recordType}: ${value}`

        if (isNaN(result[recordType] as number)) throw new Error(`value is NaN ${errorPartialString}`)
        if (result[recordType] < 0 && !allowNegativeValue) throw new Error(`value is negative ${errorPartialString}`)
        if (result[recordType] > improbableValue) {
          let showError = accumulativeKeySet.has(recordType) ? result[recordType] > improbableValue * 10 : true
          if (showError)
            throw new Error(`value is too damn high ${errorPartialString}`)
        }
      }

      const endTime = getUnixTimeNow()
      await elastic.addRuntimeLog({ runtime: endTime - startTime, success: true, metadata, })

      return {
        chain,
        startTimestamp: validStart[chain].startTimestamp,
        ...result
      }
    } catch (error) {

      const endTime = getUnixTimeNow()

      try {
        await elastic.addErrorLog({ error, metadata, errorString: error?.toString(), } as any)
        await elastic.addRuntimeLog({ runtime: endTime - startTime, success: false, metadata, });

        (error as any).chain = chain
      } catch { }
      throw error
    }
  }

  async function getOptionsObject(timestamp: number, chain: string, chainBlocks: ChainBlocks): Promise<FetchOptions> {
    const withinTwoHours = Math.trunc(Date.now() / 1000) - timestamp < 24 * 60 * 60 // 24 hours
    const createBalances: () => Balances = () => {
      let _chain = chain
      // workaround for mismatch in chain names between dimensions repo and rest of the codebase
      switch (chain) {
        case 'bitlayer': _chain = 'btr'; break;
      }
      return new Balances({ timestamp: closeToCurrentTime ? undefined : timestamp, chain: _chain })
    }
    const toTimestamp = timestamp - 1
    const fromTimestamp = toTimestamp - ONE_DAY_IN_SECONDS
    const getFromBlock = async () => await getBlock(fromTimestamp, chain)
    const getToBlock = async () => await getBlock(toTimestamp, chain, chainBlocks)
    const getLogs = async ({ target, targets, onlyArgs = true, fromBlock, toBlock, flatten = true, eventAbi, topics, topic, cacheInCloud = false, skipCacheRead = false, entireLog = false, skipIndexer, noTarget, ...rest }: FetchGetLogsOptions) => {
      fromBlock = fromBlock ?? await getFromBlock()
      toBlock = toBlock ?? await getToBlock()

      return getEventLogs({ ...rest, fromBlock, toBlock, chain, target, targets, onlyArgs, flatten, eventAbi, topics, topic, cacheInCloud, skipCacheRead, entireLog, skipIndexer, noTarget })
    }

    // we intentionally add a delay to avoid fetching the same block before it is cached
    // await randomDelay()

    let fromBlock, toBlock
    // we fetch current block and previous blocks only for evm chains/ chains we have RPC for
    if (getProvider(chain)) {
      fromBlock = await getFromBlock()
      toBlock = await getToBlock()
    }
    const fromApi = new ChainApi({ chain, timestamp: fromTimestamp, block: fromBlock })
    const api = new ChainApi({ chain, timestamp: withinTwoHours ? undefined : timestamp, block: toBlock })
    const startOfDay = getUniqStartOfTodayTimestamp(new Date(toTimestamp * 1000))
    const startTimestamp = fromTimestamp
    const endTimestamp = toTimestamp + 1
    const getStartBlock = getFromBlock
    const getEndBlock = getToBlock
    const toApi = api

    return {
      createBalances,
      getBlock,
      toTimestamp,
      fromTimestamp,
      getFromBlock,
      getToBlock,
      getLogs,
      chain,
      fromApi,
      toApi,
      api,
      startOfDay,
      startTimestamp,
      endTimestamp,
      getStartBlock,
      getEndBlock,
      dateString: getDateString(startOfDay),
    }
  }

  // code for random 1-4 second delay
  async function randomDelay() {
    const delay = Math.floor(Math.random() * 4) + 1
    return new Promise((resolve) => setTimeout(resolve, delay * 1000))
  }

  async function setChainValidStart(chain: string) {
    const cleanPreviousDayTimestamp = cleanCurrentDayTimestamp - ONE_DAY_IN_SECONDS
    let _start = adapterObject![chain]?.start ?? 0
    if (typeof _start === 'string') _start = new Date(_start).getTime() / 1000
    // if (_start === undefined) return;

    if (typeof _start === 'number') {
      validStart[chain] = {
        canRun: _start <= cleanPreviousDayTimestamp,
        startTimestamp: _start
      }
      return;
    }

    const defaultStart = Math.trunc(Date.now() / 1000)
    if (closeToCurrentTime) {// intentionally set to true to allow for backfilling
      validStart[chain] = {
        canRun: true,
        startTimestamp: defaultStart
      }
      return;
    }

    // if _start is an async function that returns timestamp
    const start = await (_start as any)().catch(() => {
      console.error(`Failed to get start time for ${name} ${adapterVersion} ${chain}`)
      return defaultStart
    })
    validStart[chain] = {
      canRun: typeof start === 'number' && start <= cleanPreviousDayTimestamp,
      startTimestamp: start
    }
  }

}

function createBalanceFrom(options: {chain: string, timestamp: number | undefined, amount: FetchResponseValue}): Balances {
  const { chain, timestamp, amount } = options

  const balance = new Balances({ chain, timestamp })
  if (amount) {
    if (typeof amount === 'number' || typeof amount === 'string') {
      balance.addUSDValue(amount)
    } else {
      balance.addBalances(amount)
    }
  }
  return balance;
}

function subtractBalance(options: {balance: Balances, amount: FetchResponseValue}) {
  const { balance, amount } = options
  if (amount) {
    if (typeof amount === 'number' || typeof amount === 'string') {
      const otherBalance = createBalanceFrom({chain: balance.chain, timestamp: balance.timestamp, amount})
      balance.subtract(otherBalance)
    } else {
      balance.subtract(amount)
    }
  }
}

function validateAdapterResult(result: any) {
  // validate metrics
  //  this is to ensure that we do this validation only for the new adapters
  if (result.dailyFees && result.dailyFees instanceof Balances && result.dailyFees.hasBreakdownBalances()) {
    // should include atleast SupplySideRevenue or ProtocolRevenue or Revenue
    if (!result.dailySupplySideRevenue && !result.dailyProtocolRevenue && !result.dailyRevenue) {
      throw Error('found dailyFees record but missing all dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue records')
    }
  }
}

function addMissingMetrics(chain: string, result: any) {
  // add missing metrics for Balances which has breakdown labels only
  //  this is to ensure that we dont change behavior of existing adapters
  if (result.dailyFees && result.dailyFees instanceof Balances && result.dailyFees.hasBreakdownBalances()) {

    // if we have supplySideRevenue but missing revenue, add revenue = fees - supplySideRevenue
    if (result.dailySupplySideRevenue && !result.dailyrevenue) {
      result.dailyRevenue = createBalanceFrom({chain, timestamp: result.timestamp, amount: result.dailyFees})
      subtractBalance({balance: result.dailyRevenue, amount: result.dailySupplySideRevenue})
    }

  }
}

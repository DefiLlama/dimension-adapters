import * as sdk from '@defillama/sdk';
import { Balances, ChainApi, elastic, getEventLogs, getProvider } from '@defillama/sdk';
import * as _env from '../../helpers/env';
import { getBlock } from "../../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphFees';
import { getDateString } from '../../helpers/utils';
import { accumulativeKeySet, BaseAdapter, BaseAdapterChainConfig, ChainBlocks, Fetch, FetchGetLogsOptions, FetchOptions, FetchV2, SimpleAdapter, } from '../types';

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

  let breakdownByToken: any = {}
  let breakdownData: any = {}
  const response = await Promise.all(chains.filter(chain => {
    const res = validStart[chain]?.canRun
    if (isTest && !res) console.log(`Skipping ${chain} because the configured start time is ${new Date(validStart[chain]?.startTimestamp * 1e3).toUTCString()} \n\n`)
    return validStart[chain]?.canRun
  }).map(getChainResult))

  const aggregatedBreakdowns = aggregateBreakdowns(breakdownData);

  Object.entries(breakdownByToken).forEach(([chain, data]: any) => {
    if (typeof data !== 'object' || data === null || !Object.keys(data).length) delete breakdownByToken[chain]
  })

  if (Object.keys(breakdownByToken).length === 0) breakdownByToken = undefined

  if (withMetadata) return { response, breakdownData, aggregatedBreakdowns }
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

      for (const [key, value] of Object.entries(result)) {
        if (ignoreKeys.includes(key)) continue;
        if (value === undefined || value === null) { // dont store undefined or null values
          delete result[key]
          continue;
        }
        // if (value === undefined || value === null) throw new Error(`Value: ${value} ${key} is undefined or null`)
        if (value instanceof Balances) {
          result[key] = await value.getUSDString()
          breakdownData[chain] = breakdownData[chain] || {}
          breakdownData[chain][key] = await value.getUSDJSONs()
          
          if (value._breakdownBalances) {
            for (const [label, bal] of Object.entries(value._breakdownBalances)) {
              const usdString = await (bal as Balances).getUSDString()
              const breakdownValue = Math.round(+usdString)

              if (!breakdownData[chain]) {
                breakdownData[chain] = {}
              }
              if (!breakdownData[chain][`${key}_breakdown`]) {
                breakdownData[chain][`${key}_breakdown`] = {}
              }
              breakdownData[chain][`${key}_breakdown`][label] = breakdownValue
            }
          }
        } else {
          result[key] = +Number(result[key]).toFixed(0)
        }
        let errorPartialString = `| ${chain}-${key}: ${value}`

        if (isNaN(result[key] as number)) throw new Error(`value is NaN ${errorPartialString}`)
        if (result[key] < 0 && !allowNegativeValue) throw new Error(`value is negative ${errorPartialString}`)
        if (result[key] > improbableValue) {
          let showError = accumulativeKeySet.has(key) ? result[key] > improbableValue * 10 : true
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

  function aggregateBreakdowns(breakdownData: any) {
    const breakdownByChain: any = {};
    const recordTypes = new Set<string>();
    const allChains = new Set<string>();

    // Collect all chains and record types
    Object.entries(breakdownData).forEach(([chain, chainData]: [string, any]) => {
      allChains.add(chain);
      Object.entries(chainData).forEach(([recordType]: [string, any]) => {
        if (recordType.endsWith('_breakdown')) {
          const baseRecordType = recordType.replace('_breakdown', '');
          recordTypes.add(baseRecordType);
        }
      });
    });

    // Build breakdownByChain with all chains (fill missing with 0)
    recordTypes.forEach(recordType => {
      breakdownByChain[recordType] = {};
      allChains.forEach(chain => {
        breakdownByChain[recordType][chain] = {};
        
        // Get breakdown data for this chain and record type
        const chainBreakdownData = breakdownData[chain]?.[`${recordType}_breakdown`] || {};
        
        // Collect all labels from all chains for this record type
        const allLabels = new Set<string>();
        Object.values(breakdownData).forEach((chainData: any) => {
          const breakdownData = chainData[`${recordType}_breakdown`] || {};
          Object.keys(breakdownData).forEach(label => allLabels.add(label));
        });
        
        // Fill all labels with 0 if not present
        allLabels.forEach(label => {
          breakdownByChain[recordType][chain][label] = Number(chainBreakdownData[label] || 0);
        });
      });
    });

    // Build breakdown (aggregated across all chains)
    const breakdown: any = {};
    recordTypes.forEach(recordType => {
      breakdown[recordType] = {};
      
      // Collect all labels for this record type
      const allLabels = new Set<string>();
      Object.values(breakdownByChain[recordType] || {}).forEach((chainData: any) => {
        Object.keys(chainData).forEach(label => allLabels.add(label));
      });
      
      // Aggregate across all chains for each label
      allLabels.forEach(label => {
        breakdown[recordType][label] = 0;
        Object.values(breakdownByChain[recordType] || {}).forEach((chainData: any) => {
          breakdown[recordType][label] += Number(chainData[label] || 0);
        });
      });
    });

    // Clean breakdownData by removing *_breakdown keys
    Object.keys(breakdownData).forEach(chain => {
      Object.keys(breakdownData[chain]).forEach(key => {
        if (key.endsWith('_breakdown')) {
          delete breakdownData[chain][key];
        }
      });
    });

    return {
      breakdown,
      breakdownByChain
    };
  }
}

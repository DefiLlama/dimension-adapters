import { Balances, ChainApi, getEventLogs, getProvider, elastic, log } from '@defillama/sdk'
import { BaseAdapter, ChainBlocks, DISABLED_ADAPTER_KEY, Fetch, FetchGetLogsOptions, FetchOptions, FetchResultGeneric, FetchV2, } from '../types'
import { getBlock } from "../../helpers/getBlock";
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphFees';
import * as _env from '../../helpers/env'
import { getDateString } from '../../helpers/utils';

// to trigger inclusion of the env.ts file
const _include_env = _env.getEnv('BITLAYER_RPC')

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

function getUnixTimeNow() {
  return Math.floor(Date.now() / 1000)
}

export default async function runAdapter(volumeAdapter: BaseAdapter, cleanCurrentDayTimestamp: number, chainBlocks: ChainBlocks, id?: string, version?: string, {
  adapterVersion = 1,
  isTest = false,
}: any = {}) {

  const closeToCurrentTime = Math.trunc(Date.now() / 1000) - cleanCurrentDayTimestamp < 24 * 60 * 60 // 12 hours
  const chains = Object.keys(volumeAdapter).filter(c => c !== DISABLED_ADAPTER_KEY)
  const validStart = {} as {
    [chain: string]: {
      canRun: boolean,
      startTimestamp: number
    }
  }
  await Promise.all(chains.map(setChainValidStart))

  const response = await Promise.all(chains.filter(chain => {
    const res = validStart[chain]?.canRun
    if (isTest && !res) console.log(`Skipping ${chain} because the configured start time is ${new Date(validStart[chain]?.startTimestamp * 1e3).toUTCString()} \n\n`)
    return validStart[chain]?.canRun
  }).map(getChainResult))
  return response

  async function getChainResult(chain: string) {
    const startTime = getUnixTimeNow()
    const metadata = {
      application: "dimensions",
      type: 'protocol-chain',
      name: id,
      chain,
      version,
    }

    const fetchFunction = volumeAdapter[chain].customBackfill ?? volumeAdapter[chain].fetch
    try {
      const options = await getOptionsObject(cleanCurrentDayTimestamp, chain, chainBlocks)
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
      // if (id)
      //   console.log("Result before cleaning", id, version, cleanCurrentDayTimestamp, chain, result, JSON.stringify(chainBlocks ?? {}))
      for (const [key, value] of Object.entries(result)) {
        if (ignoreKeys.includes(key)) continue;
        if (value === undefined || value === null) { // dont store undefined or null values
          delete result[key]
          continue;
        }
        // if (value === undefined || value === null) throw new Error(`Value: ${value} ${key} is undefined or null`)
        if (value instanceof Balances) result[key] = await value.getUSDString()
        result[key] = +Number(result[key]).toFixed(0)
        if (isNaN(result[key] as number)) throw new Error(`[${chain}]Value: ${value} ${key} is NaN`)
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
    const fromChainBlocks = {}
    const getFromBlock = async () => await getBlock(fromTimestamp, chain, fromChainBlocks)
    const getToBlock = async () => await getBlock(toTimestamp, chain, chainBlocks)
    const getLogs = async ({ target, targets, onlyArgs = true, fromBlock, toBlock, flatten = true, eventAbi, topics, topic, cacheInCloud = false, skipCacheRead = false, entireLog = false, skipIndexer, ...rest }: FetchGetLogsOptions) => {
      fromBlock = fromBlock ?? await getFromBlock()
      toBlock = toBlock ?? await getToBlock()

      return getEventLogs({ ...rest, fromBlock, toBlock, chain, target, targets, onlyArgs, flatten, eventAbi, topics, topic, cacheInCloud, skipCacheRead, entireLog, skipIndexer, })
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
    let _start = volumeAdapter[chain]?.start ?? 0
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
      console.error(`Failed to get start time for ${id} ${version} ${chain}`)
      return defaultStart
    })
    validStart[chain] = {
      canRun: typeof start === 'number' && start <= cleanPreviousDayTimestamp,
      startTimestamp: start
    }
  }
}

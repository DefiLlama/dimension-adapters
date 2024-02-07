import { Balances, ChainApi, getEventLogs } from '@defillama/sdk'
import { BaseAdapter, ChainBlocks, DISABLED_ADAPTER_KEY, FetchGetLogsOptions, FetchResultGeneric, } from '../types'
import { getBlock } from "../../helpers/getBlock";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export default async function runAdapter(volumeAdapter: BaseAdapter, cleanCurrentDayTimestamp: number, chainBlocks: ChainBlocks, id?: string, version?: string) {
  const closeToCurrentTime = Math.trunc(Date.now() / 1000) - cleanCurrentDayTimestamp < 24 * 60 * 60 // 12 hours
  const chains = Object.keys(volumeAdapter).filter(c => c !== DISABLED_ADAPTER_KEY)
  const validStart = {} as {
    [chain: string]: {
      canRun: boolean,
      startTimestamp: number
    }
  }
  await Promise.all(chains.map(setChainValidStart))

  return Promise.all(chains.filter(chain => validStart[chain]?.canRun).map(getChainResult))

  async function getChainResult(chain: string) {
    const fetchFunction = volumeAdapter[chain].customBackfill ?? volumeAdapter[chain].fetch
    try {
      const options = getOptionsObject(cleanCurrentDayTimestamp, chain, chainBlocks)
      const result: FetchResultGeneric = await fetchFunction(options.toTimestamp, chainBlocks, options);
      const ignoreKeys = ['timestamp', 'block']
      // if (id)
      //   console.log("Result before cleaning", id, version, cleanCurrentDayTimestamp, chain, result, JSON.stringify(chainBlocks ?? {}))
      for (const [key, value] of Object.entries(result)) {
        if (ignoreKeys.includes(key)) continue;
        if (value === undefined || value === null) throw new Error(`Value: ${value} ${key} is undefined or null`)
        if (value instanceof Balances) result[key] = await value.getUSDString()
        result[key] = +Number(result[key]).toFixed(0)
        if (isNaN(result[key] as number)) throw new Error(`[${chain}]Value: ${value} ${key} is NaN`)
      }
      return {
        chain,
        startTimestamp: validStart[chain].startTimestamp,
        ...result
      }
    } catch (error) {
      try { (error as any).chain = chain } catch { }
      throw error
    }
  }

  function getOptionsObject(timestamp: number, chain: string, chainBlocks: ChainBlocks) {
    const withinTwoHours = Math.trunc(Date.now() / 1000) - timestamp < 2 * 60 * 60 // 2 hours
    const createBalances: () => Balances = () => {
      return new Balances({ timestamp: closeToCurrentTime ? undefined : timestamp, chain })
    }
    const toTimestamp = timestamp - 1
    const fromTimestamp = toTimestamp - ONE_DAY_IN_SECONDS
    const fromChainBlocks = {}
    const getFromBlock = async () => await getBlock(fromTimestamp, chain, fromChainBlocks)
    const getToBlock = async () => await getBlock(toTimestamp, chain, chainBlocks)
    const getLogs = async ({ target, targets, onlyArgs = true, fromBlock, toBlock, flatten = true, eventAbi, topics, topic, cacheInCloud = false, skipCacheRead = false, }: FetchGetLogsOptions) => {
      fromBlock = fromBlock ?? await getFromBlock()
      toBlock = toBlock ?? await getToBlock()

      return getEventLogs({ fromBlock, toBlock, chain, target, targets, onlyArgs, flatten, eventAbi, topics, topic, cacheInCloud, skipCacheRead, })
    }

    return {
      createBalances,
      getBlock,
      toTimestamp,
      fromTimestamp,
      getFromBlock,
      getToBlock,
      getLogs,
      chain,
      api: new ChainApi({ chain, timestamp: withinTwoHours ? undefined : timestamp, }),
    }
  }

  async function setChainValidStart(chain: string) {
    const cleanPreviousDayTimestamp = cleanCurrentDayTimestamp - ONE_DAY_IN_SECONDS
    const _start = volumeAdapter[chain]?.start
    if (_start === undefined) return;
    if (typeof _start === 'number') {
      validStart[chain] = {
        canRun: _start <= cleanPreviousDayTimestamp,
        startTimestamp: _start
      }
    } else if (_start) {
      const defaultStart = Math.trunc(Date.now() / 1000)
      if (closeToCurrentTime) {// intentionally set to true to allow for backfilling
        validStart[chain] = {
          canRun: true,
          startTimestamp: defaultStart
        }
        return;
      }
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
}

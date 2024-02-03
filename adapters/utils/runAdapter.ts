import { Balances } from '@defillama/sdk'
import { BaseAdapter, ChainBlocks, DISABLED_ADAPTER_KEY, FetchResultGeneric, } from '../types'

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export default async function runAdapter(volumeAdapter: BaseAdapter, cleanCurrentDayTimestamp: number, chainBlocks: ChainBlocks, id?: string, version?: string) {
  const cleanPreviousDayTimestamp = cleanCurrentDayTimestamp - ONE_DAY_IN_SECONDS
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
      const result: FetchResultGeneric = await fetchFunction(cleanCurrentDayTimestamp - 1, chainBlocks);
      const ignoreKeys = ['timestamp', 'block']
      if (id)
        console.log("Result before cleaning", id, version, cleanCurrentDayTimestamp, chain, result, JSON.stringify(chainBlocks ?? {}))
      for (const [key, value] of Object.entries(result)) {
        if (ignoreKeys.includes(key)) continue;
        if (value === undefined || value === null) throw new Error(`Value: ${value} ${key} is undefined or null`)
        if (value instanceof Balances) result[key] = await value.getUSDString()
        result[key] = +Number(value).toFixed(0)
        if (isNaN(result[key] as number)) throw new Error(`Value: ${value} ${key} is NaN`)
      }
      return {
        chain,
        startTimestamp: validStart[chain].startTimestamp,
        ...result
      }
    } catch (error) {
      throw { chain, error }
    }
  }

  async function setChainValidStart(chain: string) {
    const _start = volumeAdapter[chain]?.start
    if (_start === undefined) return;
    if (typeof _start === 'number') {
      validStart[chain] = {
        canRun: _start <= cleanPreviousDayTimestamp,
        startTimestamp: _start
      }
    } else if (_start) {
      const defaultStart = Math.trunc(Date.now() / 1000)
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

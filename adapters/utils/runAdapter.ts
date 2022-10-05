import allSettled from 'promise.allsettled'
import { BaseAdapter, ChainBlocks, DISABLED_ADAPTER_KEY, FetchResult } from '../types'

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export default async function runAdapter(volumeAdapter: BaseAdapter, cleanCurrentDayTimestamp: number, chainBlocks: ChainBlocks, onError?: (e: Error) => void) {
    const cleanPreviousDayTimestamp = cleanCurrentDayTimestamp - ONE_DAY_IN_SECONDS
    const chains = Object.keys(volumeAdapter).filter(c => c !== DISABLED_ADAPTER_KEY)
    return await allSettled(chains
        .filter(async (chain) => {
            const start = await volumeAdapter[chain].start().catch(e => {
                onError?.(new Error(`Error getting start time: ${e.message}`))
                return undefined
            })
            return start !== undefined && (start <= cleanPreviousDayTimestamp) || (start === 0)
        })
        .map(async (chain) => {
            const fetchFunction = volumeAdapter[chain].customBackfill ?? volumeAdapter[chain].fetch
            try {
                const startTimestamp = await volumeAdapter[chain].start()
                const result = await fetchFunction(cleanCurrentDayTimestamp - 1, chainBlocks);
                Object.keys(result).forEach(key => {
                    if (result[key] && Number.isNaN(+result[key])) delete result[key]
                })
                return ({
                    chain,
                    startTimestamp,
                    ...result
                });
            } catch (e) {
                return await Promise.reject({ chain, error: e, timestamp: cleanPreviousDayTimestamp });
            }
        }
        )).then(res => res.map(r => r.status === 'fulfilled' ? r.value : r.reason as FetchResult))
}
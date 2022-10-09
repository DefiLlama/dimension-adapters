import allSettled from 'promise.allsettled'
import { BaseAdapter, ChainBlocks, DISABLED_ADAPTER_KEY, FetchResult, FetchResultGeneric } from '../types'

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export interface IRunAdapterResponseFulfilled extends FetchResult {
    chain: string
    startTimestamp: number
}
export interface IRunAdapterResponseRejected {
    chain: string
    timestamp: number
    error: Error
}

export default async function runAdapter(volumeAdapter: BaseAdapter, cleanCurrentDayTimestamp: number, chainBlocks: ChainBlocks) {
    const cleanPreviousDayTimestamp = cleanCurrentDayTimestamp - ONE_DAY_IN_SECONDS
    const chains = Object.keys(volumeAdapter).filter(c => c !== DISABLED_ADAPTER_KEY)
    return await allSettled(chains
        .filter(async (chain) => {
            const start = await volumeAdapter[chain].start()
            return start !== undefined && (start <= cleanPreviousDayTimestamp) || (start === 0)
        })
        .map(async (chain) => {
            const fetchFunction = volumeAdapter[chain].customBackfill ?? volumeAdapter[chain].fetch
            try {
                const startTimestamp = await volumeAdapter[chain].start()
                const result: FetchResultGeneric = await fetchFunction(cleanCurrentDayTimestamp - 1, chainBlocks);
                Object.keys(result).forEach(key => {
                    const resultValue = result[key]
                    if (resultValue && Number.isNaN(+resultValue)) delete result[key]
                })
                return ({
                    chain,
                    startTimestamp,
                    ...result
                }) as IRunAdapterResponseFulfilled;
            } catch (e) {
                return await Promise.reject({ chain, error: e, timestamp: cleanPreviousDayTimestamp } as IRunAdapterResponseRejected);
            }
        }
        ))
}

const isFulfilled = <T,>(p: PromiseSettledResult<T>): p is PromiseFulfilledResult<T> => p.status === 'fulfilled';
const isRejected = <T,>(p: PromiseSettledResult<T>): p is PromiseRejectedResult => p.status === 'rejected';
export const getFulfilledVolumes = <T>(results: PromiseSettledResult<T>[]) => results.filter(isFulfilled).map(r => r.value)
export const getRejectedVolumes = <T>(results: PromiseSettledResult<T>[]) => results.filter(isRejected).map(r => r.reason as IRunAdapterResponseRejected)
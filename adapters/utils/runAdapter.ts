import allSettled, { PromiseRejection, PromiseResolution, PromiseResult } from 'promise.allsettled'
import { IJSON } from '../../../src/adaptors/data/types'
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
    const validStart = ((await Promise.all(chains.map(async (chain) => {
        const start = await volumeAdapter[chain].start()
        return [chain, start !== undefined && (start <= cleanPreviousDayTimestamp), start]
    }))) as [string, boolean, number][]).reduce((acc, curr) => ({ ...acc, [curr[0]]: [curr[1], curr[2]] }), {} as IJSON<(boolean| number)[]>)
    return allSettled(chains
        .filter(chain => validStart[chain][0])
        .map(async (chain) => {
            const fetchFunction = volumeAdapter[chain].customBackfill ?? volumeAdapter[chain].fetch
            try {
                const startTimestamp = validStart[chain][1]
                const result: FetchResultGeneric = await fetchFunction(cleanCurrentDayTimestamp - 1, chainBlocks);
                Object.keys(result).forEach(key => {
                    const resultValue = result[key]
                    if (resultValue && Number.isNaN(+resultValue)) delete result[key]
                })
                return Promise.resolve({
                    chain,
                    startTimestamp,
                    ...result
                })
            } catch (e) {
                return Promise.reject({ chain, error: e, timestamp: cleanPreviousDayTimestamp });
            }
        })) as Promise<PromiseResult<IRunAdapterResponseFulfilled, IRunAdapterResponseRejected>[]>
}

const isFulfilled = <T,>(p: PromiseResult<T>): p is PromiseResolution<T> => p.status === 'fulfilled';
const isRejected = <T, E>(p: PromiseResult<T, E>): p is PromiseRejection<E> => p.status === 'rejected';
export const getFulfilledResults = <T,>(results: PromiseResult<T>[]) => results.filter(isFulfilled).map(r => r.value)
export const getRejectedResults = <T, E>(results: PromiseResult<T, E>[]) => results.filter(isRejected).map(r => r.reason)
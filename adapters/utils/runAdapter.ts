import allSettled, { PromiseRejection, PromiseResolution, PromiseResult } from 'promise.allsettled'
import { BaseAdapter, ChainBlocks, DISABLED_ADAPTER_KEY, FetchResult, FetchResultGeneric, IJSON } from '../types'

const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export type IRunAdapterResponseFulfilled = FetchResult & {
    chain: string
    startTimestamp: number
}
export interface IRunAdapterResponseRejected {
    chain: string
    timestamp: number
    error: Error
}

export default async function runAdapter(volumeAdapter: BaseAdapter, cleanCurrentDayTimestamp: number, chainBlocks: ChainBlocks, id?: string) {
    const cleanPreviousDayTimestamp = cleanCurrentDayTimestamp - ONE_DAY_IN_SECONDS
    const chains = Object.keys(volumeAdapter).filter(c => c !== DISABLED_ADAPTER_KEY)
    const validStart = ((await Promise.all(chains.map(async (chain) => {
        const start = await volumeAdapter[chain]?.start()
        return [chain, start !== undefined && (start <= cleanPreviousDayTimestamp), start]
    }))) as [string, boolean, number][]).reduce((acc, curr) => ({ ...acc, [curr[0]]: [curr[1], curr[2]] }), {} as IJSON<(boolean | number)[]>)
    return allSettled(chains
        .filter(chain => validStart[chain][0])
        .map(async (chain) => {
            const fetchFunction = volumeAdapter[chain].customBackfill ?? volumeAdapter[chain].fetch
            try {
                const startTimestamp = validStart[chain][1]
                const result: FetchResultGeneric = await fetchFunction(cleanCurrentDayTimestamp - 1, chainBlocks);
                if (id)
                    console.log("Result before cleaning", id, cleanCurrentDayTimestamp, chain, result, JSON.stringify(chainBlocks ?? {}))
                cleanResult(result)
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

const cleanResult = (obj: any) => {
    Object.keys(obj).forEach(key => {
        if (typeof obj[key] === 'object') cleanResult(obj[key])
        else if (!okAttribute(obj[key])) {
            console.log("Wrong value", obj[key], "with key", key)
            delete obj[key]
        }
    })
}

const okAttribute = (value: any) => {
    return !(value && Number.isNaN(+value))
}

const isFulfilled = <T,>(p: PromiseResult<T>): p is PromiseResolution<T> => p.status === 'fulfilled';
const isRejected = <T, E>(p: PromiseResult<T, E>): p is PromiseRejection<E> => p.status === 'rejected';
export const getFulfilledResults = <T,>(results: PromiseResult<T>[]) => results.filter(isFulfilled).map(r => r.value)
export const getRejectedResults = <T, E>(results: PromiseResult<T, E>[]) => results.filter(isRejected).map(r => r.reason)
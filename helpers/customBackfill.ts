import { FetchOptions, FetchResultGeneric, Fetch, FetchV2, ChainBlocks } from "../adapters/types"
import { getBlock } from "./getBlock"
import { util } from '@defillama/sdk';
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";

const { blocks: { chainsForBlocks } } = util
const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export type IGraphs = (chain: Chain) => (options: FetchOptions|number, chainBlocks: ChainBlocks) => Promise<FetchResultGeneric>

export default (chain: Chain, graphs: any): Fetch|FetchV2 => async (options: FetchOptions|number, chainBlocks: ChainBlocks): Promise<FetchResultGeneric> => {
    const fetchGetVolume = graphs(chain)
    let resultPreviousDayN: any = {}
    let resultDayN: any = {}
    if (typeof options == 'number') {
        resultDayN = await fetchGetVolume(options, chainBlocks)
        const timestampPreviousDay = options - ONE_DAY_IN_SECONDS
        let chainBlocksPreviousDay = {}
        if (chainsForBlocks.includes(chain) || chain === "ethereum")
            chainBlocksPreviousDay = { [chain]: await getBlock(timestampPreviousDay, chain, {}).catch(() => { }) }
        resultPreviousDayN = await fetchGetVolume(timestampPreviousDay, chainBlocksPreviousDay)
    } else {
        resultDayN = await fetchGetVolume(options)
        options.endTimestamp = options.endTimestamp - ONE_DAY_IN_SECONDS;
        resultPreviousDayN = await fetchGetVolume(options)
    }
    const response: FetchResultGeneric = resultDayN
    Object.keys(resultPreviousDayN).filter((key) => key.includes('total')).forEach(key => {
        const dimension = `daily${key.slice(5)}`
        if (resultDayN[dimension] === undefined) {
            const dataResultDayN = resultDayN[key] as any
            const dataResultPreviousDayN = resultPreviousDayN[key] as any
            if (dataResultPreviousDayN !== undefined && dataResultDayN !== undefined) {
                if (typeof dataResultDayN === 'object' && typeof dataResultPreviousDayN === 'object') {
                    response[dimension] = Object.keys(dataResultDayN).reduce((acc, key) => {
                        if (dataResultDayN[key] !== undefined && dataResultPreviousDayN[key] !== undefined)
                            acc[key] = BigNumber(dataResultDayN[key]).minus(dataResultPreviousDayN[key]).toString()
                        return acc
                    }, {} as typeof dataResultDayN)
                } else {
                    response[dimension] = `${Number(dataResultDayN) - Number(dataResultPreviousDayN)}`
                }
            }
        }
    })
    return response
}

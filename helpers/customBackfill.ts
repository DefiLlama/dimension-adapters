import { ChainBlocks, Fetch, FetchResultGeneric } from "../adapters/types"
import { getBlock } from "./getBlock"
import { util } from '@defillama/sdk';
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";

const { blocks: { chainsForBlocks } } = util
const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export type IGraphs = (chain: Chain) => (timestamp: number, chainBlocks: ChainBlocks) => Promise<FetchResultGeneric>

export default (chain: Chain, graphs: IGraphs): Fetch => async (timestamp: number, chainBlocks: ChainBlocks): Promise<FetchResultGeneric> => {
    const fetchGetVolume = graphs(chain)
    const resultDayN = await fetchGetVolume(timestamp, chainBlocks)
    const timestampPreviousDay = timestamp - ONE_DAY_IN_SECONDS
    let chainBlocksPreviousDay = {}
    if (chainsForBlocks.includes(chain) || chain === "ethereum")
        chainBlocksPreviousDay = { [chain]: await getBlock(timestampPreviousDay, chain, {}).catch(() => { }) }
    const resultPreviousDayN = await fetchGetVolume(timestampPreviousDay, chainBlocksPreviousDay)
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

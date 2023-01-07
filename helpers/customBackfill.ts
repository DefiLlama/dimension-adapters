import { ChainBlocks, Fetch, FetchResultGeneric } from "../adapters/types"
import { getBlock } from "./getBlock"
import { util } from '@defillama/sdk';
import { Chain } from "@defillama/sdk/build/general";

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
    const response: FetchResultGeneric = { timestamp: resultDayN.timestamp, block: resultDayN.block, dailyVolume: resultDayN?.dailyVolume, totalVolume: resultDayN?.totalVolume }
    Object.keys(resultPreviousDayN).filter((key) => key.includes('total')).forEach(key => {
        const dimension = `daily${key.slice(5)}`
        if (resultDayN[dimension] === undefined) {
            if (resultPreviousDayN[key] !== undefined && resultDayN[key] !== undefined) {
                response[dimension] = `${Number(resultDayN[key]) - Number(resultPreviousDayN[key])}`
            }
        }
    })
    return response
}

import { ChainBlocks, Fetch } from "../adapters/types"
import { getBlock } from "./getBlock"
import { util } from '@defillama/sdk';
import { Chain } from "@defillama/sdk/build/general";

const { blocks: {chainsForBlocks } } = util
const ONE_DAY_IN_SECONDS = 60 * 60 * 24

export type IGraphs = (chain: Chain) => (timestamp: number, chainBlocks: ChainBlocks) => Promise<{
    timestamp: number;
    block?: number;
    totalVolume: string;
    dailyVolume?: string;
}>

export default (chain: Chain, graphs: IGraphs): Fetch => async (timestamp: number, chainBlocks: ChainBlocks) => {
    const fetchGetVolume = graphs(chain)
    const resultDayN = await fetchGetVolume(timestamp, chainBlocks)
    const timestampPreviousDay = timestamp - ONE_DAY_IN_SECONDS
    let chainBlocksPreviousDay = {}
    if (chainsForBlocks.includes(chain) || chain === "ethereum")
        chainBlocksPreviousDay = { [chain]: await getBlock(timestampPreviousDay, chain, {}).catch(() => { }) }
    const resultPreviousDayN = await fetchGetVolume(timestampPreviousDay, chainBlocksPreviousDay)
    return {
        block: resultDayN.block,
        timestamp: resultDayN.timestamp,
        totalVolume: resultDayN.totalVolume,
        dailyVolume: `${Number(resultDayN.totalVolume) - Number(resultPreviousDayN.totalVolume)}`,
    }
}
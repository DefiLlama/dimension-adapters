import fetchURL from "../../utils/fetchURL";
import { Adapter, Fetch, FetchResultIncentives, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import * as sdk from "@defillama/sdk";

type IResponse = Array<{
    hash: string
    height: number
    time: number
    block_index: number

}>

const BASE_REWARD = 50
const HALVING_BLOCKS = 210000
const getBTCRewardByBlock = (block: number) => BASE_REWARD / Math.trunc((block / HALVING_BLOCKS) + 1)

const getDailyBlocksByTimestampLast24h = async (timestamp: number) => {
    const url = `https://blockchain.info/blocks/${timestamp * 1000}?format=json`
    return (await fetchURL(url)) as IResponse
}

const getIncentives: Fetch = async (timestamp: number): Promise<FetchResultIncentives> => {
    const dayBlocks = await getDailyBlocksByTimestampLast24h(timestamp)
    const rewardByBlock = getBTCRewardByBlock(dayBlocks[0].height)
    const tokens = await sdk.Balances.getUSDString({ 'coingecko:bitcoin': dayBlocks.length * rewardByBlock}, timestamp)
    return {
        timestamp,
        block: dayBlocks[0].height,
        tokenIncentives: tokens,
    }
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.BITCOIN]: {
            fetch: getIncentives,
            start: '2015-07-30',
        },
    },
    protocolType: ProtocolType.CHAIN
}

export default adapter

import fetchURL from "../../utils/fetchURL";
import { Adapter, Fetch, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";

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
    return (await fetchURL(url)).data as IResponse
}

const getAverageBitcoinPriceLast24h = async (timestamp: number) => {
    const AVERAGE_POINTS = 6
    const offset = 24 / AVERAGE_POINTS
    return Promise.all(
        [...Array(AVERAGE_POINTS).keys()]
            .map(async (_, index) =>
                (await getPrices(['coingecko:bitcoin'], timestamp - (index * offset)))['coingecko:bitcoin'].price)
    ).then(prices => {
        const sum = prices.reduce((a, b) => a + b, 0);
        return (sum / prices.length) || 0
    })
}

const getIncentives: Fetch = async (timestamp: number) => {
    const dayBlocks = await getDailyBlocksByTimestampLast24h(timestamp)
    const averageBTCPrice = await getAverageBitcoinPriceLast24h(timestamp)
    const rewardByBlock = getBTCRewardByBlock(dayBlocks[0].height)
    return {
        timestamp,
        block: dayBlocks[0].height,
        tokens: {
            BTC: dayBlocks.length * rewardByBlock * averageBTCPrice
        }
    }
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.BITCOIN]: {
            fetch: getIncentives,
            start: async () => 1438228800,
        },
    },
    protocolType: ProtocolType.CHAIN
}

export default adapter
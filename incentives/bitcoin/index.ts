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

const getBTCRewardByBlock = (block: number) => {

}

const getDailyBlocksByTimestamp = async (timestamp: number) => {
    const url = `https://blockchain.info/blocks/${timestamp * 1000}?format=json`
    return (await fetchURL(url)).data as IResponse
}

const getIncentives: Fetch = async (timestamp: number) => {
    const dayBlocks = await getDailyBlocksByTimestamp(timestamp)
    for (let i = 0; i<48; i++) {
        const BTC_PRICE = await getPrices(['coingecko:bitcoin'], timestamp+60*60*i)
        console.log("BTC_PRICE", BTC_PRICE)
    }
    return {
        timestamp,
        block: dayBlocks[dayBlocks.length - 1].height,
        tokens: {
            BTC: "BTC_PRICE"
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
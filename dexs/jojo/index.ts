import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getPrices } from "../../utils/prices";

const historicalVolumeEndpoint = (symbol: string) => `https://api.arbitrum.jojo.exchange/v1/klines?marketId=${symbol}&interval=1D&startTime=1681776000000&limit=500`

const coins = {
    'ethusdc': 'coingecko:ethereum',
    'btcusdc': 'coingecko:bitcoin',
}

interface IVolumeall {
    id: string;
    volume: string;
    tokenPrice: string;
    timestamp: number;
}
const fetch = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical = (await Promise.all(Object.keys(coins).map((coins: string) => fetchURL(historicalVolumeEndpoint(coins)))))
        .map((a: any, index: number) => a.data.map((e: any) => { return { timestamp: e.time / 1000, volume: e.volume, id: Object.values(coins)[index] } })).flat()
    const prices = (await getPrices(Object.values(coins), dayTimestamp))

    const historicalUSD = historical.map((e: IVolumeall) => {
        return {
            ...e,
            volumeUSD: Number(e.volume) * prices[e.id]?.price || 0
        }
    });
    const dailyVolume = historicalUSD.filter((e: IVolumeall) => e.timestamp === dayTimestamp)
        .reduce((a: number, { volumeUSD }) => a + volumeUSD, 0);
    const totalVolume = historicalUSD.filter((e: IVolumeall) => e.timestamp <= dayTimestamp)
        .reduce((a: number, { volumeUSD }) => a + volumeUSD, 0);
    return {
        totalVolume: `${totalVolume}`,
        dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
        timestamp: dayTimestamp,
    };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: async () => 1682035200,
        },
    },
};

export default adapter;

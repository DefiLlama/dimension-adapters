import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (symbol: string) => `https://api.zksync.jojo.exchange/v1/klines?marketId=${symbol}&interval=1D&startTime=1687017600000&limit=500`

const coins = {
    'ethusdc': 'coingecko:ethereum',
    'btcusdc': 'coingecko:bitcoin',
}

interface IVolumeall {
    id: string;
    volume: string;
    timestamp: number;
    quoteVolume: string;
}
const fetch = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical = (await Promise.all(Object.keys(coins).map((coins: string) => fetchURL(historicalVolumeEndpoint(coins)))))
        .map((a: any, index: number) => a.data.map((e: any) => { return { timestamp: e.time / 1000, volume: e.volume, id: Object.values(coins)[index], quoteVolume: e.quote_volume } })).flat()

    const historicalUSD = historical.map((e: IVolumeall) => {
        return {
            ...e,
            volumeUSD: Number(e.quoteVolume)
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
        [CHAIN.ERA]: {
            fetch,
            start: async () => 1687017600,
        },
    },
};

export default adapter;

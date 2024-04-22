import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
const historicalVolumeEndpointZk = (symbol: string, chain: string) => `https://api.` + chain +`-mainnet.jojo.exchange/v1/platform/tradeVolume?marketId=${symbol}`
const coins = {
    'ethusdc': 'coingecko:ethereum',
    'btcusdc': 'coingecko:bitcoin',
    'solusdc': 'coingecko:solana'
}

interface IVolumeall {
    id: string;
    volume: string;
    timestamp: number;
}

const getVolume = async (timestamp: number, chain: string) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))

    const historical = (await Promise.all(Object.keys(coins).map((coins: string) => fetchURL(historicalVolumeEndpointZk(coins, chain)))));

    const historicalVolume = historical.map((item => item.dailyVolume))    
    const historicalUSD = historicalVolume.map((a: any, index: number) => a.map((e: any) => { return { timestamp: e.t / 1000, volume: e.v, id: Object.values(coins)[index]} })).flat()
    const historicalUSD2 = historicalUSD.map((e: IVolumeall) => {
        return {
            ...e,
            volumeUSD: Number(e.volume)
        }
    });
    const dailyVolume = historicalUSD2.filter((e: IVolumeall) => e.timestamp === dayTimestamp)
        .reduce((a: number, { volumeUSD }) => a + volumeUSD, 0);
    console.log(dailyVolume)

    const totalVolume = historical.map(item => item.totalVolume).reduce((accumulator, currentValue) => accumulator + parseFloat(currentValue), 0);
    return {
        totalVolume: `${totalVolume}`,
        dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
        timestamp: dayTimestamp,
    };
};

const getFetch = (chain: string): Fetch => async (timestamp: number) => {
    return getVolume(timestamp, chain);
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.BASE]: {
            fetch: getFetch("base"),
            start: 1711965100,
        },
    },
};

export default adapter;

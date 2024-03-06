import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpointZk = (symbol: string, chain: string) => `https://api.`+ chain +`-mainnet.jojo.exchange/v1/klines?marketId=${symbol}&interval=1D&startTime=1687017600000&limit=500`
const coins = {
    'ethusdc': 'coingecko:ethereum',
    'btcusdc': 'coingecko:bitcoin',
    'arbusdc': 'coingecko:arbitrum',
    'solusdc': 'coingecko:solana',
    'linkusdc': 'coingecko:link',
    'memeusdc': 'coingecko:meme',
    'ordiusdc': 'coingecko:ordi',
    'wldusdc': 'coingecko:wld',
    'agixusdc': 'coingecko:agix',
    'arusdc': 'coingecko:ar',
    'tiausdc': 'coingecko:tia',
    'strkusdc': 'coingecko:strk',
    'avaxusdc': 'coingecko:avax',
    'xrpusdc': 'coingecko:xrp',
    'trxusdc': 'coingecko:trx',
    'rndrusdc': 'coingecko:rndr',
    'adausdc': 'coingecko:ada',
    'altusdc': 'coingecko:alt',
    'dogeusdc': 'coingecko:doge',
    'xaiusdc': 'coingecko:xai'
}

interface IVolumeall {
    id: string;
    volume: string;
    timestamp: number;
    quoteVolume: string;
}
const getVolume = async (timestamp: number, chain: string) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical = (await Promise.all(Object.keys(coins).map((coins: string) => fetchURL(historicalVolumeEndpointZk(coins, chain)))))
        .map((a: any, index: number) => a.map((e: any) => { return { timestamp: e.time / 1000, volume: e.volume, id: Object.values(coins)[index], quoteVolume: e.quote_volume } })).flat()

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

const getFetch = (chain: string): Fetch => async (timestamp: number) => {
    return getVolume(timestamp, chain);
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: getFetch("arbitrum"),
            start: 1687017600,
        },
    },
};

export default adapter;

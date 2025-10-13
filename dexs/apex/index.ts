import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (symbol: string, endTime: number) => `https://pro.apex.exchange/api/v1/klines?end=${endTime}&interval=D&start=1708732800&symbol=${symbol}&limit=10`
const allTiker = (symbol: string) => `https://pro.apex.exchange/api/v1/ticker?symbol=${symbol}`
interface IVolumeall {
    id: string;
    volume: string;
    timestamp: number;
    price: string;
    volumeUSD: number;
}
const symbol: string[] = [...new Set([
    '1000PEPEUSDC', 'APTUSDC',      'ARBUSDC',
    'ATOMUSDC',     'AVAXUSDC',     'BCHUSDC',
    'BLURUSDC',     'BNBUSDC',      'BTCUSDC',
    'BTCUSDT',      'DOGEUSDC',     'DYDXUSDC',
    'ETCUSDC',      'ETHUSDC',      'ETHUSDT',
    'LBRUSDC',      'LDOUSDC',      'LINKUSDC',
    'LTCUSDC',      'MATICUSDC',    'OPUSDC',
    'ORDIUSDT',     'SOLUSDC',      'TIAUSDC',
    'TONUSDC',      'WLDUSDC',      'XRPUSDC',
    'STXUSDT',      'BIGTIMEUSDT',  'MEMEUSDT',
    'PYTHUSDT',     'FETUSDT',      'RNDRUSDT',
    'ICPUSDT',      '1000BONKUSDT', 'DOTUSDT',
    'SEIUSDT',      'INJUSDT',      'ENSUSDT',
    '1000SATSUSDT', 'PENDLEUSDT',   'GMTUSDT',
    'MANTAUSDT',    'LINKUSDT',     'SOLUSDT',
    'MATICUSDT',    'STRKUSDT',     'SUIUSDT'
])]
interface IOpenInterest {
    id: string;
    openInterest: string;
    lastPrice: string;
}

const fetch = async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: any[] = (await Promise.all(symbol.map((coins: string) => fetchURL(historicalVolumeEndpoint(coins, dayTimestamp + 60 * 60 * 24)))))
        .map((e: any) => Object.values(e.data)).flat().flat()
        .map((e: any) => { return { timestamp: e.t / 1000, volume: e.v, price: e.c } });
    const openInterestHistorical: IOpenInterest[] = (await Promise.all(symbol.map((coins: string) => fetchURL(allTiker(coins)))))
        .map((e: any) => e.data).flat().map((e: any) => { return { id: e.symbol, openInterest: e.openInterest, lastPrice: e.lastPrice } });
    const openInterestAtEnd = openInterestHistorical.reduce((a: number, { openInterest, lastPrice }) => a + Number(openInterest) * Number(lastPrice), 0);
    const historicalUSD = historical.map((e: IVolumeall) => {
        return {
            ...e,
            volumeUSD: Number(e.volume) * Number(e.price)
        }
    });
    const dailyVolume = historicalUSD.filter((e: IVolumeall) => e.timestamp === dayTimestamp)
        .reduce((a: number, { volumeUSD }) => a + volumeUSD, 0);
    return {
        dailyVolume: dailyVolume,
        openInterestAtEnd,
    };
};


const adapter: SimpleAdapter = {
    deadFrom: '2025-04-26', // https://apex-pro.gitbook.io/apex-pro/apex-pro-discontinued/about-apex-pro
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2022-10-05',
        }
    },
};

export default adapter;

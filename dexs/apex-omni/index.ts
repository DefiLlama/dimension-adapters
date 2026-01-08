import fetchURL, { httpGet } from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
const plimit = require('p-limit');
const limits = plimit(1);

const historicalVolumeEndpoint = (symbol: string, endTime: number) => `https://omni.apex.exchange/api/v3/klines?end=${endTime}&interval=D&start=1718380800&symbol=${symbol}&limit=10`
const allTiker = (symbol: string) => `https://omni.apex.exchange/api/v3/ticker?symbol=${symbol}`
const getSumbols = async () => {
    const res = await fetchURL('https://omni.apex.exchange/api/v3/all-open-tickers')
    const symbol = res?.data?.map((i: any) => i?.ticker_id)
    return symbol || []
}
interface IVolumeall {
    id: string;
    volume: string;
    timestamp: number;
    price: string;
    volumeUSD: number;
}

interface IOpenInterest {
    id: string;
    openInterest: string;
    lastPrice: string;
}

const fetch = async (timestamp: number) => {
    const symbol = (await getSumbols());

    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historical: any[] = (await Promise.all(symbol.map((coins: string) => limits(() => httpGet(historicalVolumeEndpoint(coins, dayTimestamp + 60 * 60 * 24), { timeout: 10000 })))))
        .map((e: any) => Object.values(e.data)).flat().flat()
        .map((e: any) => { return { timestamp: e.t / 1000, volume: e.v, price: e.c } });
    const openInterestHistorical: IOpenInterest[] = (await Promise.all(symbol.map((coins: string) => limits(() => httpGet(allTiker(coins), { timeout: 10000 })))))
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
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch,
            start: '2024-06-14',
        }
    },
};

export default adapter;

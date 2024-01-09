import axios from "axios";

import type { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface ITicker {
    full_market_name: string;
    quote_symbol: string;
    base_symbol: string;
    quote_id: string;
    base_id: string;
    lowest_price_24h: number;
    highest_price_24h: number;
    last_price: number;
    quote_volume: number;
    base_volume: number;
}

interface ITickers {
    [market_full_name: string]: ITicker;
}


interface IExchangeRates {
    [key: string]: number;
}


const OSWAP_STATS_ENDPOINT = "https://v2-stats.oswap.io/api/v1";

const getTickers = async () => {
    const tickers: ITickers = (await axios.get(`${OSWAP_STATS_ENDPOINT}/tickers`))?.data;
    return Object.values(tickers);
}

const getExchangeRates = async () => {
    const exchangeRates: IExchangeRates = (await axios.get(`${OSWAP_STATS_ENDPOINT}/exchangeRates`))?.data;

    return exchangeRates;
}


const getDailyVolume = async () => {
    const tickers = await getTickers();
    const exchangeRates = await getExchangeRates();

    const volume = tickers.map(({ base_id, quote_id, quote_volume, base_volume, base_symbol }) => {
        let volumeInUSD = 0;
        const assetId0 = base_id === "base" ? "GBYTE" : base_id;
        const assetId1 = quote_id === "base" ? "GBYTE" : quote_id;

        if (exchangeRates[`${assetId0}_USD`]) {
            volumeInUSD = exchangeRates[`${assetId0}_USD`] * base_volume;
        } else if (exchangeRates[`${assetId1}_USD`]) {
            volumeInUSD = exchangeRates[`${assetId1}_USD`] * quote_volume;
        }

        return {
            base_volume,
            base_symbol,
            quote_volume,
            d: exchangeRates[`${assetId0}_USD`],
            c: exchangeRates[`${assetId1}_USD`],
            volumeInUSD
        };
    }).filter((a: any) => a.base_symbol !== 'O-GBYTE-BUSD').reduce((acc: any, { volumeInUSD }: any) => acc + volumeInUSD, 0);

    return volume;
}


const fetch = async (timestamp: number) => {
    const dailyVolume = await getDailyVolume();

    return {
        timestamp,
        dailyVolume: dailyVolume.toString(),
    } as FetchResultVolume
}


const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.OBYTE]: {
            start: async () => 1677542400,
            runAtCurrTime: true,
            fetch: fetch
        }
    }
};

export default adapter;

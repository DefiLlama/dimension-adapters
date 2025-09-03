import {CHAIN} from "../../helpers/chains";
import {FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import {getUniqStartOfTodayTimestamp} from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL"
import { FetchOptions } from "../../adapters/types";

const tickers_endpoint = 'https://server-prod.hz.vestmarkets.com/v2/ticker/24hr'

const blacklisted_tickers = ['VC-PERP'] // wash trading

const fetch = async (): Promise<FetchResultVolume> => {
    // const from_date = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000));
    // const to_date = from_date + 86400;
    // const data = (await fetchURL(`https://serverprod.vest.exchange/v2/exchangeInfo/volume?from_date=${from_date * 1000}&to_date=${to_date * 1000}`));

    const data = (await fetchURL(tickers_endpoint)).tickers;
    const dailyVolume = data.filter((ticker: any) => !blacklisted_tickers.includes(ticker.symbol)).reduce((acc: number, ticker: any) => acc + Number(ticker.quoteVolume || 0), 0);

    return {
        dailyVolume: dailyVolume,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.BASE]: {
            fetch,
            runAtCurrTime: true,
            start: '2025-01-01',
        },
    },
};
export default adapter;
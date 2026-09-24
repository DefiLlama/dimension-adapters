import {CHAIN} from "../../helpers/chains";
import {FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import fetchURL from "../../utils/fetchURL"

const tickers_endpoint = 'https://api-gateway.hz.vestmarkets.com/v3/ticker/24hr'

const blacklisted_tickers = ['VC-PERP'] // wash trading

const fetch = async (): Promise<FetchResultVolume> => {
    const data = (await fetchURL(tickers_endpoint)).tickers;
    const dailyVolume = data.filter((ticker: any) => !blacklisted_tickers.includes(ticker.symbol)).reduce((acc: number, ticker: any) => acc + Number(ticker.quoteVolume || 0), 0);

    return {
        dailyVolume: dailyVolume,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.OFF_CHAIN]: {
            fetch,
            runAtCurrTime: true,
            start: '2025-01-01',
        },
    },
};
export default adapter;
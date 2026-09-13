import {CHAIN} from "../../helpers/chains";
import {FetchOptions, FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import fetchURL from "../../utils/fetchURL"

const tickers_endpoint = 'https://server-prod.hz.vestmarkets.com/v2/ticker/24hr'

const blacklisted_tickers = ['VC-PERP'] // wash trading

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    // const from_date = getUniqStartOfTodayTimestamp(new Date(options.startOfDay * 1000));
    // const to_date = from_date + 86400;
    // const data = (await fetchURL(`https://serverprod.vest.exchange/v2/exchangeInfo/volume?from_date=${from_date * 1000}&to_date=${to_date * 1000}`));

    const data = (await fetchURL(tickers_endpoint)).tickers;
    const dailyVolume = options.createBalances();
    for (const ticker of data) {
        if (blacklisted_tickers.includes(ticker.symbol)) continue;
        const baseAsset = String(ticker.symbol).split("-")[0]; // "TSM-USD-PERP" -> "TSM", "BZ-PERP" -> "BZ"
        dailyVolume.addUSDValue(Number(ticker.quoteVolume || 0), { id: baseAsset, isUSDValue: true });
    }

    return {
        dailyVolume,
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
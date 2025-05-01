import type { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const PEPE_TEAM_DEX_URL = "https://dex-api.pepe.team"
const STABLECOINS = ["USDT"];

interface Ticker {
    symbol: String;
};

const get24hTickers = async (): Promise<Ticker[]> => {
    return (await fetchURL(`${PEPE_TEAM_DEX_URL}/spot/market/tickers/24h`)).map(raw => { return { symbol: raw[0] } })
}

interface KLine {
    quoteVolume: number
};

interface KLinesResponse {
    has_next_page: boolean,
    last_cursor: string,
    data: KLineRaw[]
};

interface KLineRaw {
    quote_volume: string,
};

const getKlines = async (symbol: String, since: number, until: number, limit: number): Promise<KLine[]> => {
    let acc: KLine[] = [];
    let res: KLinesResponse = (await fetchURL(`${PEPE_TEAM_DEX_URL}/spot/market/klines/${symbol}/m1?since=${since}&until=${until}&sort=DESC&limit=${limit}`));
    acc = acc.concat(res.data.map(raw => { return { quoteVolume: parseFloat(raw.quote_volume) } }));

    while (res.has_next_page) {
        res = (await fetchURL(`${PEPE_TEAM_DEX_URL}/spot/market/klines/${symbol}/m1?since=${since}&until=${until}&sort=DESC&limit=${limit}&after=${res.last_cursor}`));
        acc = acc.concat(res.data.map(raw => { return { quoteVolume: parseFloat(raw.quote_volume) } }));
    }

    return acc;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const tickers24h = await get24hTickers();
    const tickers24hWithStablecoinQuoteVolume = tickers24h.filter(ticker => {
        const [_, quoteAsset] = ticker.symbol.split('-');
        return STABLECOINS.includes(quoteAsset);
    });
    const volumes = await Promise.all(tickers24hWithStablecoinQuoteVolume.map(ticker => getKlines(ticker.symbol, options.fromTimestamp * 1000, options.toTimestamp * 1000, 1000)));

    return {
        dailyVolume: volumes.flat().reduce((acc, kline) => acc + kline.quoteVolume, 0),
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.WAVES]: {
            fetch,
            start: "2025-01-28"
        }
    }
};

export default adapter;
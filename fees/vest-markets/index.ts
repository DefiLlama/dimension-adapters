import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import pLimit from "p-limit";

const VEST_MARKETS_API = 'https://server-prod.hz.vestmarkets.com/v2';
const limit = pLimit(10);

//https://docs.vestmarkets.com/trading/fees

const WEEKEND_FOREX_FEE_RATE = 0.025 / 100;
const OVERNIGHT_STOCK_FEE_RATE = 0.05 / 100;
const CRYPTO_FEE_RATE = 0.01 / 100;
const WEEKEND_STOCK_FEE_RATE = 1 / 100;

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const today = new Date(options.startOfDay * 1000).getDay();
    const isWeekend = today === 6 || today === 0;
    const { symbols } = await fetchURL(`${VEST_MARKETS_API}/exchangeInfo`);

    const symbolsByCategory = symbols.reduce((acc: any, curr: any) => {
        acc[curr.asset].push(curr.symbol);
        return acc;
    }, { stock: [], crypto: [], forex: [] });

    const [stockTradeDate, cryptoTradeData, forexTradeData] = await Promise.all(Object.keys(symbolsByCategory).map((category: string) => fetchURL(`${VEST_MARKETS_API}/ticker/24hr?symbols=${symbolsByCategory[category].join(',')}`)));

    const getQuoteTotalVolume = (tradeData: any) => tradeData.tickers.reduce((acc: number, curr: any) => acc + +curr.quoteVolume, 0);

    const cryptoPerpFees = getQuoteTotalVolume(cryptoTradeData) * CRYPTO_FEE_RATE;

    const forexPerpFees = getQuoteTotalVolume(forexTradeData) * (isWeekend ? WEEKEND_FOREX_FEE_RATE : 0);

    let stockPerpFees = 0;
    if (isWeekend) stockPerpFees = getQuoteTotalVolume(stockTradeDate) * WEEKEND_STOCK_FEE_RATE;
    else {
        const isEST = new Date(options.startOfDay * 1000).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" }).split(" ").pop() === "EST";
        const overnightTradingStart = isEST ? options.startOfDay + 3600 : options.startOfDay;
        const overnightTradingEnd = overnightTradingStart + 8 * 3600;

        const overNightTradeData = await Promise.all(symbolsByCategory.stock.map((stock: string) => limit(() => fetchURL(`${VEST_MARKETS_API}/klines?symbol=${stock}&interval=30m&startTime=${overnightTradingStart * 1000}&endTime=${overnightTradingEnd * 1000}&limit=16`))));

        stockPerpFees = overNightTradeData.flat().reduce((acc: number, curr: any) => acc + +curr[7], 0) * OVERNIGHT_STOCK_FEE_RATE;
    }

    const dailyFees = cryptoPerpFees + forexPerpFees + stockPerpFees

    return { dailyFees }
}

const methodology = {
    Fees: "Trading Fees paid by perp market traders",
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    methodology,
    start: '2025-01-01'
};

export default adapter;
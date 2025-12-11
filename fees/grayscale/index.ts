import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import pLimit from "p-limit";
import { httpGet } from "../../utils/fetchURL";

const limit = pLimit(5);

const GRAYSCALE_ETP_IDS = [
    "798c92cb-8d1b-4acc-afe8-3bffff68a68a", //BTC
    "84e97fa9-1e3a-4517-9d23-2785739ac061", //GBTC
    "5d118ad2-3579-4def-b4ca-48aa3c1cec82", //GLNK
    "f4cc74ed-fc93-4299-82c9-298b82dc9786", //GDOG
    "03bd9e70-4592-49c2-bd8b-a177e570e7c3", //ETHE
    "073ab6ce-fa46-446e-b4e7-5239f2817954", //ETH
    "96299a8d-7395-4b16-a318-650d2907f0ef", //GSOL
    "66737f7b-eba9-46e1-bd57-80d618c77fca", //GXRP
];

const NON_ROBIHOOD_LISTED_ETPS_EXPENSE_RATIO: Record<string, number> = {
    "GDLC": 0.59
}

const ROBINHOOD_API_URL = "https://bonfire.robinhood.com/instruments";
const NASDAQ_API_URL = "https://api.nasdaq.com/api/quote";
const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36" }

async function fetch(_a: any, _b: any, options: FetchOptions): Promise<FetchResult> {
    const durationWrtYear = (options.toTimestamp - options.fromTimestamp) / (365 * 24 * 60 * 60);

    const etpsInfo = await Promise.all(GRAYSCALE_ETP_IDS.map(etp => limit(() => httpGet(`${ROBINHOOD_API_URL}/${etp}/etp-details`))));

    const additionalEtpsInfo = await Promise.all(Object.keys(NON_ROBIHOOD_LISTED_ETPS_EXPENSE_RATIO).map(etp => limit(() => httpGet(`${NASDAQ_API_URL}/${etp}/summary?assetclass=etf`, {
        headers
    }))));

    additionalEtpsInfo.forEach(etp => etpsInfo.push({
        aum: etp.data.summaryData.MarketCap.value.replaceAll(",", ""),
        gross_expense_ratio: NON_ROBIHOOD_LISTED_ETPS_EXPENSE_RATIO[etp.data.symbol]
    }));

    const dailyFees = etpsInfo.reduce((acc, curr) => acc + +curr.aum * +curr.gross_expense_ratio * durationWrtYear / 100, 0);

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
}

const methodology = {
    Fees: "Management fees paid by ETP holders",
    Revenue: "All the fees are revenue",
    ProtocolRevenue: "All the revenue goes to protocol"
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.OFF_CHAIN],
    methodology,
    start: "2025-12-10", //Though its easy to get historic nav, its pretty hard to get historic aum, so starts from adapter listing date
};

export default adapter;

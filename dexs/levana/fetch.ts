import BigNumber from "bignumber.js";
import fetchURL from "../../utils/fetchURL";
import { MarketInfo} from "./types";
const plimit = require('p-limit');
const limit = plimit(1);

const INDEXER_URL = 'https://indexer-mainnet.levana.finance';

export async function fetchVolume(kind: "daily" | "total", marketInfos: MarketInfo[], timestampSeconds: number) {
    const timestamp = new Date(timestampSeconds * 1000).toISOString();
    // it's either 1 day back or "all the days" back
    const intervalDays = kind === "daily" ? 1 : Math.floor(timestampSeconds / (24 * 60 * 60));

    const url = (marketsStr: string) => `${INDEXER_URL}/rolling_trade_volume?market=${marketsStr}&timestamp=${timestamp}&interval_days=${intervalDays}`

    const result = (await Promise.all(marketInfos.map(marketInfo => limit(() => fetchURL(url(marketInfo.addr))))))
        .map((response: any) => response.data)
        .map((data: any) => Number(data));

    return result.reduce((a: number, b: number) => a + b, 0);
}

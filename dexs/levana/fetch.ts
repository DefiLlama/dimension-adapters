import BigNumber from "bignumber.js";
import fetchURL from "../../utils/fetchURL";
import { MarketInfo} from "./types";

const INDEXER_URL = 'https://indexer.levana.finance';

export async function fetchVolume(kind: "daily" | "total", marketInfos: MarketInfo[], timestampSeconds: number) {
    const marketsStr = marketInfos.map(({addr}) => `market=${addr}`).join("&");
    const timestamp = new Date(timestampSeconds * 1000).toISOString();
    // it's either 1 day back or "all the days" back
    const intervalDays = kind === "daily" ? 1 : Math.floor(timestampSeconds / (24 * 60 * 60));

    const url = `${INDEXER_URL}/rolling_trade_volume?${marketsStr}&timestamp=${timestamp}&interval_days=${intervalDays}`

    return new BigNumber((await fetchURL(url)).data);
}
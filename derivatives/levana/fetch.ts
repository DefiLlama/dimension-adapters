import BigNumber from "bignumber.js";
import fetchURL from "../../utils/fetchURL";
import { ChainId, DateString, MarketAddr, TradeVolumeResp } from "./types";
const INDEXER_URL = 'https://indexer.levana.finance';

export async function fetchVolume(marketAddrs: MarketAddr[], kind: "daily" | "cumulative", startDate: DateString, endDate: DateString) {
    const api = kind === "daily" ? "trade-volume" : "cumulative-trade-volume";

    const url = `${INDEXER_URL}/${api}?scope=daily&start_date=${startDate}&end_date=${endDate}`;
    const resp: TradeVolumeResp = (await fetchURL(url)).data;

    if (!resp || !resp[startDate]) {
        throw Error(`unable to retrieve daily volume for ${startDate}`)
    }

    const totalVolume = Object.entries(resp[startDate]).reduce((totalVolume, [marketAddr, volumePerMarket]) => {
        return (marketAddrs.includes(marketAddr))
            ? totalVolume.plus(BigNumber(volumePerMarket))
            : totalVolume;

    }, BigNumber(0))

    return totalVolume.toString();
}

export async function fetchMarketAddrs(chainId: string) {
    interface Market {
        chain: string;
        contract: string;
    }

    const url = `${INDEXER_URL}/markets`;
    const markets: [Market] = (await fetchURL(url))?.data;

    return markets
        .filter(market => chainId === market.chain)
        .map(market => market.contract);
}

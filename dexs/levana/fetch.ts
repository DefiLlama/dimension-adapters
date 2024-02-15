import BigNumber from "bignumber.js";
import fetchURL from "../../utils/fetchURL";
const plimit = require('p-limit');
const limit = plimit(1);

const INDEXER_URL = "https://indexer-mainnet.levana.finance";
const QUERIER_URL = "https://querier-mainnet.levana.finance";

type Chain = "osmosis" | "injective" | "sei"

const factoryAddr:Record<Chain, string> = {
    osmosis: "osmo1ssw6x553kzqher0earlkwlxasfm2stnl3ms3ma2zz4tnajxyyaaqlucd45",
    sei: "sei18rdj3asllguwr6lnyu2sw8p8nut0shuj3sme27ndvvw4gakjnjqqper95h",
    injective: "inj1vdu3s39dl8t5l88tyqwuhzklsx9587adv8cnn9"
}

const networkName:Record<Chain, string> = {
    osmosis: "osmosis-mainnet",
    sei: "sei-mainnet",
    injective: "injective-mainnet"
}

export interface MarketInfo {
    id: string,
    addr: string,
}

export async function fetchVolume(kind: "daily" | "total", marketInfos: MarketInfo[], timestampSeconds: number) {
    const timestamp = new Date(timestampSeconds * 1000).toISOString();
    // it's either 1 day back or "all the days" back
    const intervalDays = kind === "daily" ? 1 : Math.floor(timestampSeconds / (24 * 60 * 60));

    const url = (marketsStr: string) => `${INDEXER_URL}/rolling_trade_volume?market=${marketsStr}&timestamp=${timestamp}&interval_days=${intervalDays}`;

    const result = (await Promise.all(marketInfos.map(marketInfo => limit(() => fetchURL(url(marketInfo.addr))))))
        .map((response: any) => response)
        .map((data: any) => BigNumber(data));

    return result.reduce((a: BigNumber, b: BigNumber) => a.plus(b), BigNumber(0))
}

export async function fetchMarketInfos(chain: Chain): Promise<MarketInfo[]> {

    interface FactoryResponse {
        [addr: string]: {
            market_id: string
        }
    }
    const url = `${QUERIER_URL}/v1/perps/factory-market-status?network=${networkName[chain]}&factory=${factoryAddr[chain]}`
    const result:FactoryResponse = await fetchURL(url);

    return Object.entries(result).reduce((acc, [addr, {market_id}]) => {
        acc.push({
            id: market_id,
            addr
        })
        return acc;
    }, [] as MarketInfo[])
}
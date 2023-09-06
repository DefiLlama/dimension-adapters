import {Adapter, ChainBlocks, IStartTimestamp} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import BigNumber from "bignumber.js";
import {getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC} from "../../utils/date";

const indexer = 'https://indexer.levana.finance';

interface Market {
    chain: string;
    contract: string;
}

type DailyTradeVolume = Record<string, string>;
type DailyTradeVolumeResp = Record<string, DailyTradeVolume>;

async function getTotalVolume(marketAddrs: string[]) {
    const path = '/total-trade-volume';
    const marketQueryString = marketAddrs.map(market => `market=${market}`).join('&')
    const url = `${indexer}${path}?${marketQueryString}`;
    return (await fetchURL(url)).data;
}

async function getDailyVolume(timestamp: number, markets: string[]) {
    const startTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)
    const endTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const startDate = dateStr(startTimestamp);
    const endDate = dateStr(endTimestamp);
    const url = `${indexer}/trade-volume?scope=daily&start_date=${startDate}&end_date=${endDate}`;
    const resp: DailyTradeVolumeResp = (await fetchURL(url)).data;

    let totalVolume: BigNumber = BigNumber(0);
    let volumes = resp[startDate];

    if (volumes === undefined) {
        throw Error(`unable to retrieve daily volume for ${startDate}`)
    }

    for (const market in volumes) {
        if (markets.includes(market)) {
            totalVolume = totalVolume.plus(BigNumber(volumes[market]));
        }
    }

    return totalVolume.toString();
}

async function getMarketAddrs(chainId: string) {
    const url = `${indexer}/markets`;
    const markets: [Market] = (await fetchURL(url))?.data;

    return markets
        .filter(market => chainId === market.chain)
        .map(market => market.contract);
}

function dateStr(timestamp: number): string {
    let date = new Date(timestamp * 1000)
    return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`
}

const fetch = async (timestamp: number, chainId: string) => {
    const marketAddrs = await getMarketAddrs(chainId);
    const dimensionRequests = [
        getTotalVolume(marketAddrs),
        getDailyVolume(timestamp, marketAddrs)
    ]
    const [totalVolume, dailyVolume] = await Promise.all(dimensionRequests);

    return {
        timestamp,
        totalVolume,
        dailyVolume
    };
}

interface ChainConfig {
    chainId: string;
    start: number;
}

// The start timestamps refer to the launch of the ATOM/USD market and SEI/USD market respectively
const config: Record<string, ChainConfig> = {
    osmosis: { chainId: 'osmosis-1', start: 1686025556 },
    sei: { chainId: 'pacific-1', start: 1692345706 }
}

const adapter: Adapter = {
    adapter: {}
}

Object.keys(config).forEach(chain => {
    adapter.adapter[chain] = {
        start: async () => config[chain].start,
        fetch: async (timestamp) => fetch(timestamp, config[chain].chainId),
        runAtCurrTime: true,
    }
})

export default adapter;
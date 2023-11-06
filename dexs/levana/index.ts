import {Adapter, BaseAdapter, FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import {getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC} from "../../utils/date";
import { fetchMarketAddrs, fetchVolume } from "./fetch";
import { ChainId } from "./types";
import { dateStr } from "./utils";

const adapter: SimpleAdapter = {
    // each of these is the time of factory instantiation
    adapter: {
        osmosis: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketAddrs = await fetchMarketAddrs("osmosis-1");
                const [totalVolume, dailyVolume] = await Promise.all([
                    getTotalVolume(marketAddrs, timestamp),
                    getDailyVolume(marketAddrs, timestamp)
                ]);
                return {
                    timestamp,
                    dailyVolume: dailyVolume.toString(),
                    totalVolume: totalVolume.toString()
                }
            },
            start: async () => 1688628356
        },
        sei: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketAddrs = await fetchMarketAddrs("pacific-1");
                const [totalVolume, dailyVolume] = await Promise.all([
                    getTotalVolume(marketAddrs, timestamp),
                    getDailyVolume(marketAddrs, timestamp)
                ]);
                return {
                    timestamp,
                    dailyVolume: dailyVolume.toString(),
                    totalVolume: totalVolume.toString()
                }
            },
            start: async () => 1691305909
        },
        injective: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketAddrs = await fetchMarketAddrs("injective-1");
                const [totalVolume, dailyVolume] = await Promise.all([
                    getTotalVolume(marketAddrs, timestamp),
                    getDailyVolume(marketAddrs, timestamp)
                ]);
                return {
                    timestamp,
                    dailyVolume: dailyVolume.toString(),
                    totalVolume: totalVolume.toString()
                }
            },
            start: async () => 1695738685
        }
    }
}


async function getTotalVolume(marketAddrs: string[], timestamp: number) {
    const startDate = dateStr(getTimestampAtStartOfPreviousDayUTC(timestamp))
    const endDate = dateStr(getTimestampAtStartOfDayUTC(timestamp));

    return fetchVolume(marketAddrs, "cumulative", startDate, endDate);
}

async function getDailyVolume(marketAddrs: string[], timestamp: number) {
    const startDate = dateStr(getTimestampAtStartOfPreviousDayUTC(timestamp))
    const endDate = dateStr(getTimestampAtStartOfDayUTC(timestamp));
    return fetchVolume(marketAddrs, "daily", startDate, endDate);
}


export default adapter;

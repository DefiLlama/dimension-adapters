import {Adapter} from "../../adapters/types";
import {getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC} from "../../utils/date";
import { fetchMarketAddrs, fetchVolume } from "./fetch";
import { ChainId } from "./types";
import { dateStr } from "./utils";

const adapter: Adapter = {
    // each of these is the time of factory instantiation 
    adapter: {
        osmosis: makeAdapter("osmosis-1", 1688628356),
        sei: makeAdapter("pacific-1", 1691305909),
        injective: makeAdapter("injective-1", 1695738685)
    }
}

function makeAdapter(chainId: ChainId, start: number) {
    return {
        start: async () => start,
        fetch: async (timestamp:number) => {

            const marketAddrs = await fetchMarketAddrs(chainId);

            const [totalVolume, dailyVolume] = await Promise.all([
                getTotalVolume(marketAddrs, timestamp),
                getDailyVolume(marketAddrs, timestamp)
            ]);

            return {
                timestamp,
                totalVolume,
                dailyVolume
            };
        },
        runAtCurrTime: false,
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
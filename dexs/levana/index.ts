import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchMarketInfos, fetchVolume } from "./fetch";

const adapter: SimpleAdapter = {
    // start times are factory instantiation
    adapter: {
        osmosis: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos("osmosis");
                const [dailyVolume, totalVolume] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                    fetchVolume("total", marketInfos, timestamp)
                ]);
                return { timestamp, dailyVolume, totalVolume, }
            },
            start: 1688628356
        },
        sei: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos("sei");

                const [dailyVolume, totalVolume] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                    fetchVolume("total", marketInfos, timestamp)
                ]);

                return { timestamp, dailyVolume, totalVolume, }
            },
            start: 1691305909
        },
        injective: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos("injective");

                const [dailyVolume, totalVolume] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                    fetchVolume("total", marketInfos, timestamp)
                ]);

                return { timestamp, dailyVolume, totalVolume, }
            },
            start: 1695738685
        }
    }
}

export default adapter;

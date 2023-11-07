import {FetchResultVolume, SimpleAdapter} from "../../adapters/types";
import { fetchVolume } from "./fetch";
import { queryMarketInfos } from "./query";

const adapter: SimpleAdapter = {
    // start times are factory instantiation
    adapter: {
        osmosis: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await queryMarketInfos({chain: "osmosis"});

                const [dailyVolume, totalVolume] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                    fetchVolume("total", marketInfos, timestamp)
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
                const marketInfos = await queryMarketInfos({chain: "sei"});

                const [dailyVolume, totalVolume] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                    fetchVolume("total", marketInfos, timestamp)
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
                const marketInfos = await queryMarketInfos({chain: "injective"});

                const [dailyVolume, totalVolume] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                    fetchVolume("total", marketInfos, timestamp)
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

export default adapter;

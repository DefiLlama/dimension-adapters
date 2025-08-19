import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchMarketInfos, fetchVolume } from "./fetch";

const adapter: SimpleAdapter = {
    // start times are factory instantiation
    adapter: {
        osmosis: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos("osmosis");
                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                ]);
                return { timestamp, dailyVolume, }
            },
            start: '2023-07-06'
        },
        sei: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos("sei");

                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                ]);

                return { timestamp, dailyVolume, }
            },
            start: '2023-08-06'
        },
        injective: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos("injective");

                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                ]);

                return { timestamp, dailyVolume, }
            },
            start: '2023-09-26'
        },
        neutron: {
            fetch: async (timestamp: number): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos("neutron");

                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, timestamp),
                ]);

                return { timestamp, dailyVolume, }
            },
            start: '2024-05-08'
        }
    }
}

export default adapter;

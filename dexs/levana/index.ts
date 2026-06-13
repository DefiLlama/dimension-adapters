import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchMarketInfos, fetchVolume } from "./fetch";

const adapter: SimpleAdapter = {
    // start times are factory instantiation
    adapter: {
        [CHAIN.OSMOSIS]: {
            fetch: async (options: FetchOptions): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos(CHAIN.OSMOSIS);
                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, options.toTimestamp),
                ]);
                return { dailyVolume, }
            },
            start: '2023-07-06'
        },
        [CHAIN.SEI]: {
            fetch: async (options: FetchOptions): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos(CHAIN.SEI);

                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, options.toTimestamp),
                ]);

                return { dailyVolume, }
            },
            start: '2023-08-06'
        },
        [CHAIN.INJECTIVE]: {
            fetch: async (options: FetchOptions): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos(CHAIN.INJECTIVE);

                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, options.toTimestamp),
                ]);

                return { dailyVolume, }
            },
            start: '2023-09-26'
        },
        [CHAIN.NEUTRON]: {
            fetch: async (options: FetchOptions): Promise<FetchResultVolume> => {
                const marketInfos = await fetchMarketInfos(CHAIN.NEUTRON);

                const [dailyVolume,] = await Promise.all([
                    fetchVolume("daily", marketInfos, options.toTimestamp),
                ]);

                return { dailyVolume, }
            },
            start: '2024-05-08'
        }
    }
}

export default adapter;

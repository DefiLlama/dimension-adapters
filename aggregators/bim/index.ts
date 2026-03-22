import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import { fetchBimChains } from "./config";


const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const { dailyVolume } = await fetchBungeeData(options, { swapVolume: true }, '2758')
    return {
        dailyVolume,
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    doublecounted: true, //Bungee
    adapter: fetchBimChains().reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: '2026-01-13',
            }
        }
    }, {})
};

export default adapter;

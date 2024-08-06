import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
    [s: string]: string;
}

const url: IUrl = {
    [CHAIN.SUI]: `https://tkmw8dmcp8.execute-api.ap-southeast-1.amazonaws.com/prod/volume/clmm/`
}

interface IVolume {
    totalVolume: number,
    dailyVolume: number,
    weeklyVolume: number,
    monthlyVolume: number,
}

const fetch = (chain: Chain) => {
    return async ({ endTimestamp }): Promise<FetchResultV2> => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000));
        // fetch for the passed timestamp.
        const volumeUrl = url[chain] + String(endTimestamp);
        const volume: IVolume = (await fetchURL(volumeUrl));
        return {
            totalVolume: `${volume?.totalVolume || undefined}`,
            dailyVolume: `${volume?.dailyVolume || undefined}`,
            timestamp: dayTimestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetch(CHAIN.SUI),
            start: 1683604174,
        }
    },
};

export default adapter;
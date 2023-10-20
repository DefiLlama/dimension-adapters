import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
    [s: string]: string;
}

const url: IUrl = {
    [CHAIN.SUI]: "https://tkmw8dmcp8.execute-api.ap-southeast-1.amazonaws.com/prod/volume"
}

interface IVolume {
    totalVolume: number,
    dailyVolume: number,
    weeklyVolume: number,
    monthlyVolume: number,
}

const fetch = (chain: Chain) => {
    return async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
        const volume: IVolume = (await fetchURL(url[chain]))?.data;
        return {
            totalVolume: `${volume?.totalVolume || undefined}`,
            dailyVolume: `${volume?.dailyVolume || undefined}`,
            weekVolume: `${volume?.weeklyVolume || undefined}`,
            monthVolume: `${volume?.monthlyVolume || undefined}`,
            timestamp: dayTimestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetch(CHAIN.SUI),
            runAtCurrTime: true,
            start: async () => 1697595431,
        }
    },
};

export default adapter;
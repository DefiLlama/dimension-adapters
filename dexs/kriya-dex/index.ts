import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
    [s: string]: string;
}

const url: IUrl = {
    [CHAIN.SUI]: `https://api.kriya.finance/defillama/amm/`
}

interface IVolume {
    totalVolume: number,
    dailyVolume: number,
}

const fetch = (chain: Chain) => {
    return async ({ endTimestamp }): Promise<FetchResultV2> => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000));
        const volumeUrl = `${url[chain]}?timestamp=${dayTimestamp}`;
        const volume: IVolume = (await fetchURL(volumeUrl))?.data;

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
            start: '2023-05-09',
        }
    },
};

export default adapter;
import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
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
    return async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
        const volumeUrl = `${url[chain]}?timestamp=${timestamp}`;
        const volume: IVolume = (await fetchURL(volumeUrl))?.data;

        return {
            totalVolume: `${volume?.totalVolume || undefined}`,
            dailyVolume: `${volume?.dailyVolume || undefined}`,
            timestamp: dayTimestamp,
        };
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetch(CHAIN.SUI),
            start: '2023-05-09',
        }
    },
};

export default adapter;
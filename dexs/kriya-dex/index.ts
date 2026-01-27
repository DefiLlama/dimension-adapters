import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
    [s: string]: string;
}

const url: IUrl = {
    [CHAIN.SUI]: `https://api.kriya.finance/defillama/amm/`
}

interface IVolume {
    dailyVolume: number,
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.startTimestamp * 1000));
    const volumeUrl = `${url[options.chain]}?timestamp=${dayTimestamp}`;
    const volume: IVolume = (await fetchURL(volumeUrl))?.data;

    return {
        dailyVolume: `${volume?.dailyVolume || 0}`
    };
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetch,
            start: '2023-05-09',
        }
    },
};

export default adapter;
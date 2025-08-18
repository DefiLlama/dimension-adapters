import fetchURL from "../../utils/fetchURL"
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
    [s: string]: string;
}

// https://api.kriya.finance/defillama/clmm

const url: IUrl = {
    [CHAIN.SUI]: 'https://api-service-81678480858.asia-northeast1.run.app/pools/v3'
}

interface IVolume {
    volume24h: string
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const data: IVolume[] = (await fetchURL(url[options.chain]))?.data;
    let totalVolume = 0;
    data.map((item) => {
        totalVolume += Number(item.volume24h);
    })

    return {
        dailyVolume: `${totalVolume || 0}`
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SUI]: {
            fetch,
            start: '2023-05-09',
            runAtCurrTime: true,
        }
    },
};

export default adapter;
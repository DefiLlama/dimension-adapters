import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

let cachedData: any = null;
let fetchPromise: Promise<any> | null = null;

const fetchFees = async (options: FetchOptions) => {
    const res = await queryDune("4865365", {
      start: options.startTimestamp,
      end: options.endTimestamp,
    });

    return {
      data: res || []
    };
}

const getFees = async (options: FetchOptions) => {
    if (cachedData) {
        return cachedData;
    }
    if (!fetchPromise) {
        fetchPromise = fetchFees(options).then(data => {
            cachedData = data;
            fetchPromise = null;
            return data;
        }).catch(err => {
            fetchPromise = null; // in case of error
            throw err;
        });
    }
    return fetchPromise;
}

const fetch = async (options: FetchOptions) => {
    const dailyFees = await getFees(options);
    const fee = options.createBalances();
    const data = dailyFees.data.filter((d: any) => d.CHAIN === options.chain);
    
    if (data.length > 0) {
        fee.addUSDValue(data[0].AMOUNT_USD);
    }

    return { dailyFees: fee };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.BASE]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.OPTIMISM]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.SCROLL]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.XDAI]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.AVAX]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.LINEA]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.POLYGON]: {
            fetch: fetch,
            start: '2024-11-05'
        },
        [CHAIN.BSC]: {
            fetch: fetch,
            start: '2024-11-05'
        },
    },
    isExpensiveAdapter: true,
}

export default adapter;

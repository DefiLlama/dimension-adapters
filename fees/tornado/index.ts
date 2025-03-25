import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

let cachedData: any = null;
let fetchPromise: Promise<any> | null = null;

const fetchFees = async (options: FetchOptions) => {
    const res = await queryDune("4898710", {
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
    switch (options.chain) {
        case CHAIN.ETHEREUM:
            fee.add('0x0000000000000000000000000000000000000000', dailyFees.data.find((d: any) => d.currency === 'eth')?.total_fee);
            fee.add('0x39aa39c021dfbae8fac545936693ac917d5e7563', dailyFees.data.find((d: any) => d.currency === '0x39aa39c021dfbae8fac545936693ac917d5e7563')?.total_fee);
            fee.add('0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', dailyFees.data.find((d: any) => d.currency === '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599')?.total_fee);
            fee.add('0x5d3a536e4d6dbd6114cc1ead35777bab948e3643', dailyFees.data.find((d: any) => d.currency === '0x5d3a536e4d6dbd6114cc1ead35777bab948e3643')?.total_fee);
            fee.add('0xdac17f958d2ee523a2206206994597c13d831ec7', dailyFees.data.find((d: any) => d.currency === '0xdac17f958d2ee523a2206206994597c13d831ec7')?.total_fee);
            fee.add('0x6b175474e89094c44da98b954eedeac495271d0f', dailyFees.data.find((d: any) => d.currency === '0x6b175474e89094c44da98b954eedeac495271d0f')?.total_fee);
            break;
        case CHAIN.BSC:
            fee.add('0x0000000000000000000000000000000000000000', dailyFees.data.find((d: any) => d.currency === 'bnb')?.total_fee);
            break;
        case CHAIN.AVAX:
            fee.add('0x0000000000000000000000000000000000000000', dailyFees.data.find((d: any) => d.currency === 'avalanche_avax')?.total_fee);
            break;
        case CHAIN.OPTIMISM:
            fee.add('0x0000000000000000000000000000000000000000', dailyFees.data.find((d: any) => d.currency === 'optimism_eth')?.total_fee);
            break;
        case CHAIN.ARBITRUM:
            fee.add('0x0000000000000000000000000000000000000000', dailyFees.data.find((d: any) => d.currency === 'arbitrum_eth')?.total_fee);
            break;
        case CHAIN.POLYGON:
            fee.add('0x0000000000000000000000000000000000000000', dailyFees.data.find((d: any) => d.currency === 'polygon_matic')?.total_fee);
            break;
        case CHAIN.XDAI:
            fee.add('0x0000000000000000000000000000000000000000',  dailyFees.data.find((d: any) => d.currency === 'gnosis')?.total_fee);
        default:
            break;
    }

    return { dailyFees: fee };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
        },
        [CHAIN.BSC]: {
            fetch: fetch,
        },
        [CHAIN.AVAX]: {
            fetch: fetch,
        },
        [CHAIN.OPTIMISM]: {
            fetch: fetch,
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
        },
        [CHAIN.POLYGON]: {
            fetch: fetch,
        },
        [CHAIN.XDAI]: {
            fetch: fetch,
        }
    },
    isExpensiveAdapter: true
};

export default adapter;

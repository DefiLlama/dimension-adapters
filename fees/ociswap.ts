import { BreakdownAdapter, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import fetchURL from "../utils/fetchURL"

interface PoolStatistics {
    pool_type: string;
    fees: {
        xrd: {
            '24h': string;
            total: string;
        };
        usd: {
            '24h': string;
            total: string;
        };
    };
}

const fetchFees = (poolType: 'basic' | 'precision') => {
    return async (_a: number): Promise<FetchResultFees> => {
        const response: Array<PoolStatistics> = await fetchURL('http://api.ociswap.com/statistics/pool-types');

        const index = response.findIndex(pool => pool.pool_type === poolType);

        const dailyFees = Number(response[index].fees.usd["24h"]);

        return {
            dailyFees,
        };
    };
};

const adapters: BreakdownAdapter = {
    version: 2,
    breakdown: {
        basic: {
            [CHAIN.RADIXDLT]: {
                fetch: fetchFees('basic'),
                start: '2023-10-01',
                runAtCurrTime: true,
            }
        },
        precision: {
            [CHAIN.RADIXDLT]: {
                fetch: fetchFees('precision'),
                start: '2023-10-01',
                runAtCurrTime: true,
            }
        }
    }
}
export default adapters;
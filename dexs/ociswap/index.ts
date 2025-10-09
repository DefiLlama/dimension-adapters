import { BreakdownAdapter, FetchResultVolume, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"

interface PoolStatistics {
    pool_type: string;
    volume: {
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

const fetchVolume = (poolType: 'basic' | 'precision') => {
    return async (timestamp: number): Promise<FetchResultVolume> => {
        const response: Array<PoolStatistics> = await fetchURL('http://api.ociswap.com/statistics/pool-types');

        const index = response.findIndex(pool => pool.pool_type === poolType);

        const dailyVolume = Number(response[index].volume.usd["24h"]);

        return {
            dailyVolume: dailyVolume,
            timestamp
        };
    };
};

const adapters: BreakdownAdapter = {
    version: 2,
    breakdown: {
        basic: {
            [CHAIN.RADIXDLT]: {
                fetch: fetchVolume('basic'),
                start: '2023-10-01',
                // runAtCurrTime: true
            }
        },
        precision: {
            [CHAIN.RADIXDLT]: {
                fetch: fetchVolume('precision'),
                start: '2023-10-01',
                // runAtCurrTime: true
            }
        }
    }
}
export default adapters;
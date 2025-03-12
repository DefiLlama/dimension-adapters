import { Adapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';

const API_ENDPOINT =
    'https://mainnetapiserver.logx.network/api/v1/stats/dashboard';

interface LogXDashboardResponse {
    cumulativeTotalFees: string;
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            start: '2024-09-11',
            fetch: async (_timestamp: number, _: any) => {
                const response: LogXDashboardResponse = await fetchURL(
                    API_ENDPOINT
                );
                const totalFees = BigInt(
                    Math.round(parseFloat(response.cumulativeTotalFees))
                ).toString();

                return {
                    totalFees: totalFees,
                };
            },
        },
    },
};

export default adapter;

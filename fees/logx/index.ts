import { Adapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphVolume';

const DASHBOARD_API =
    'https://mainnetapiserver.logx.network/api/v1/stats/dashboard';
const DAILY_FEES_API =
    'https://mainnetapiserver.logx.network/api/v1/stats/charts/dailyFees';

interface LogXDashboardResponse {
    cumulativeTotalFees: string;
}

interface LogXDailyFeesResponse {
    aggregatedFees: {
        date: string[];
        trading_fee: string[];
    };
}

const adapter: Adapter = {
    adapter: {
        [CHAIN.LOGX]: {
            start: '2024-09-11',
            fetch: async (_timestamp: number, _: any, { startOfDay }) => {
                const [dashboardResponse, dailyFeesResponse] =
                    await Promise.all([
                        fetchURL(
                            DASHBOARD_API
                        ) as Promise<LogXDashboardResponse>,
                        fetchURL(
                            DAILY_FEES_API
                        ) as Promise<LogXDailyFeesResponse>,
                    ]);
                const totalFees = BigInt(
                    Math.round(
                        parseFloat(dashboardResponse.cumulativeTotalFees)
                    )
                ).toString();
                const t = getUniqStartOfTodayTimestamp(
                    new Date(startOfDay * 1000)
                );
                const dateStr =
                    new Date(startOfDay * 1000).toISOString().split('T')[0] +
                    'T00:00:00Z';
                const dayIndex =
                    dailyFeesResponse.aggregatedFees.date.indexOf(dateStr);

                const dailyFees =
                    dayIndex >= 0
                        ? (
                              BigInt(
                                  dailyFeesResponse.aggregatedFees.trading_fee[
                                      dayIndex
                                  ]
                              ) / BigInt(1e18)
                          ).toString()
                        : undefined;

                return {
                    totalFees,
                    dailyFees,
                    timestamp: t,
                };
            },
        },
    },
};

export default adapter;

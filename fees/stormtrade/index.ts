import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'
import { SimpleAdapter } from "../../adapters/types";

const adapter: SimpleAdapter = {
    methodology: {
        Fees: 'Traders pay opening and closing fees',
        DataSource: 'Data prepared by the project team by indexing blockchain data'
    },
    version: 1,
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: '2023-11-14',
            fetch: async (timestamp: number,) => {
                const response = await fetchURL('https://api5.storm.tg/api/markets/stats')

                if (!response) {
                    throw new Error('Error during API call')
                }

                const dailyFees = parseInt(response.exchangedDailyFees) / 1e9;

                return {
                    dailyUserFees: dailyFees,
                    dailyFees,
                    dailyRevenue: `${dailyFees * 0.3}`,
                    dailyHoldersRevenue: `${dailyFees * 0.3}`,
                    timestamp: timestamp,
                }
            },
        },
    },
}

export default adapter;

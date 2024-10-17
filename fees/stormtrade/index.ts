import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'


export default {
    version: 1,
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: 1700000000,
            meta: {
                methodology: {
                    Fees: 'Traders pay opening and closing fees',
                    DataSource: 'Data prepared by the project team by indexing blockchain data'
                },
            },
            fetch: async () => {
                const response = await fetchURL('https://api5.storm.tg/api/markets/stats')

                if (!response) {
                    throw new Error('Error during API call')
                }

                return {
                    dailyUserFees: parseInt(response.exchangedDailyFees) / 1e9,
                    dailyFees:  parseInt(response.exchangedDailyFees) / 1e9,
                    timestamp: new Date().getTime() / 1000
                }
            },
        },
    },
}

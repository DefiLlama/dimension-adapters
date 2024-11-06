import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'
import { FetchResult } from "../../adapters/types";

export default {
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: 1700000000,
            meta: {
                methodology: {
                    DailyVolume: 'Leverage trading volume',
                    DataSource: 'Data prepared by the project team by indexing blockchain data'
                },
            },
            fetch: async (timestamp: number): Promise<FetchResult> => {
                const response = await fetchURL(`https://api5.storm.tg/api/markets/stats?adapter=defiliama&ts=${timestamp}`)

                if (!response) {
                    throw new Error('Error during API call')
                }

                return {
                    dailyVolume: parseInt(response.exchangedDailyTradingVolume) / 1e9,
                    timestamp: timestamp,
                }
            },
        },
    },
}

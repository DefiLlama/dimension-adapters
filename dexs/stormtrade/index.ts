import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'
import { FetchResult, FetchOptions } from "../../adapters/types";

export default {
    methodology: {
        Volume: 'Leverage trading volume'
    },
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: '2023-11-14',
            fetch: async (options: FetchOptions): Promise<FetchResult> => {
                const response = await fetchURL(`https://api5.storm.tg/api/markets/stats?adapter=defiliama&ts=${options.toTimestamp}`)

                if (!response) {
                    throw new Error('Error during API call')
                }

                return {
                    dailyVolume: parseInt(response.exchangedDailyTradingVolume) / 1e9,
                }
            },
        },
    },
}

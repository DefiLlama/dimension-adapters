import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'


export default {
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: async () => 1700000000,
            meta: {
                methodology: {
                    DailyVolume: 'Leverage trading volume',
                    DataSource: 'Data collected by the re:doubt team, available at https://beta.redoubt.online/tracker'
                },
            },
            fetch: async () => {
                const response = await fetchURL('https://api.redoubt.online/dapps/v1/export/defi/storm')

                if (!response.data) {
                    throw new Error('Error during re:doubt API call')
                }

                return {
                    dailyVolume: response.data.volume.toString(),
                    timestamp: response.data.timestamp
                }
            },
        },
    },
}

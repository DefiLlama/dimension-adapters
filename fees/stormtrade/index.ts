import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'


export default {
    adapter: {
        [CHAIN.TON]: {
            runAtCurrTime: true,
            start: async () => 1700000000,
            meta: {
                methodology: {
                    Fees: 'Traders pay opening and closing fees',
                    DataSource: 'Data collected by the re:doubt team, available at https://beta.redoubt.online/tracker'
                },
            },
            fetch: async () => {
                const response = await fetchURL('https://api.redoubt.online/dapps/v1/export/defi/storm')

                if (!response.data) {
                    throw new Error('Error during re:doubt API call')
                }

                return {
                    dailyUserFees: response.data.fees.toString(),
                    dailyFees: response.data.fees.toString(),
                    timestamp: response.data.timestamp
                }
            },
        },
    },
}

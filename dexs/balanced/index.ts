import { getPoolFees_24h, getPoolVolumes_24h } from './balanced.ts'
import { CHAIN } from '../../helpers/chains'

export default {
    version: 1,
    adapter: {
        [CHAIN.ICON]: {
            runAtCurrTime: true,
            start: 1700000000,
            meta: {
                methodology: {
                    Fees: 'Users pay fees for trading on the Balanced DEX.',
                    DataSource: 'Data is sourced from the Balanced Network API and ICON Tracker RPC Node. It is processed to calculate trading fees and volume accrued over a 24-hour period. Stats can be verified at https://stats.balanced.network/'
                },
            },
            fetch: async () => {
                const volumeResponse = await getPoolVolumes_24h()
                const feeResponse = await getPoolFees_24h()
   
                return {
                    dailyVolume: volumeResponse.toString(),
                    dailyFees: feeResponse.toString(),
                    timestamp: Date.now()
                }
            },
        },
    }
}
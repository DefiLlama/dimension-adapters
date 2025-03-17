import { FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

const BNB_ADDRESS = "0x0000000000000000000000000000000000000000"
const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const volumeMethod = "/volume"

const fetch = async (options: FetchOptions) => {
    const response = await httpGet(apiBaseURL + volumeMethod)
    const feesMethod = "/fees"
    const feesResponse = await httpGet(apiBaseURL + feesMethod)
    
    const volume = options.createBalances()
    const dailyVolume = options.createBalances()
    volume.add(BNB_ADDRESS, response.volume)
    dailyVolume.add(BNB_ADDRESS, response.dailyVolume)
    const fees = options.createBalances()
    const dailyFees = options.createBalances()
    const revenue = options.createBalances()
    const dailyRevenue = options.createBalances()

    fees.add(BNB_ADDRESS, feesResponse.totalFee)
    dailyFees.add(BNB_ADDRESS, feesResponse.totalDailyFee)
    revenue.add(BNB_ADDRESS, feesResponse.totalFee)
    dailyRevenue.add(BNB_ADDRESS, feesResponse.totalDailyFee)
    
    return { totalVolume: volume, dailyVolume, totalFees: fees, dailyFees, totalRevenue: revenue, dailyRevenue }
}

export default {
    version: 2,
    adapter: {
        [CHAIN.BSC]: {
            fetch: fetch
        },
    },
}

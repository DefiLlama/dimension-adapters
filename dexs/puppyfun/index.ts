import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

const BNB_ADDRESS = ADDRESSES.null
const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const volumeMethod = "/volume"
const feesMethod = "/fees"

const fetch = async (options: FetchOptions) => {
    const volumeResponse = await httpGet(apiBaseURL + volumeMethod)

    const feesResponse = await httpGet(apiBaseURL + feesMethod)

    const volume = options.createBalances()
    const dailyVolume = options.createBalances()
    volume.add(BNB_ADDRESS, volumeResponse.volume)
    dailyVolume.add(BNB_ADDRESS, volumeResponse.dailyVolume)

    const fees = options.createBalances()
    const dailyFees = options.createBalances()
    const revenue = options.createBalances()
    const dailyRevenue = options.createBalances()

    fees.add(BNB_ADDRESS, feesResponse.totalFee)
    dailyFees.add(BNB_ADDRESS, feesResponse.dailyTotalFee)
    revenue.add(BNB_ADDRESS, feesResponse.totalFee)
    dailyRevenue.add(BNB_ADDRESS, feesResponse.dailyTotalFee)

    return {
        totalVolume: volume,
        dailyVolume,
        totalFees: fees,
        dailyFees,
        totalRevenue: revenue,
        dailyRevenue,
    }
}

export default {
    version: 2,
    adapter: {
        [CHAIN.BSC]: {
            fetch: fetch,
        },
    },
    methodology: {
        Fees: "Token trading and launching fees paid by users.",
        Revenue: "All fees are revenue.",
    }
}

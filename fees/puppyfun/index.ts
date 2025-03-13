import { FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import axios from "axios"

const BNB_ADDRESS = "0x0000000000000000000000000000000000000000"

const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const feesMethod = "/fees"

const maxRetriesCount = 3

const fetch: any = async (options: FetchOptions) => {
    for (let tryCount = 0; tryCount < maxRetriesCount; ++tryCount) {
        try {
            console.log(`Query Volume ...`)
            const response = await axios.get(apiBaseURL + feesMethod)
            console.log(response.data)

            const fees = options.createBalances()
            const dailyFees = options.createBalances()
            const revenue = options.createBalances()
            const dailyRevenue = options.createBalances()

            fees.add(BNB_ADDRESS, response.data.totalFee)
            dailyFees.add(BNB_ADDRESS, response.data.totalDailyFee)
            // revenue == fees (no users fees)
            revenue.add(BNB_ADDRESS, response.data.totalFee)
            dailyFees.add(BNB_ADDRESS, response.data.totalDailyFee)

            return {
                totalFees: fees,
                totalRevenue: revenue,
                dailyFees,
                dailyRevenue
            }
        } catch (err) {
            console.log(`Error getting Volume`, err)
            continue
        }
    }
}

export default {
    version: 2,
    adapter: {
        [CHAIN.BSC]: {
            fetch: fetch,
            // start: "2024-12-01",
        },
    },
}

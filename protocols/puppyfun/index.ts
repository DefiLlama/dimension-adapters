import { FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import axios from "axios"

const BNB_ADDRESS = "0x0000000000000000000000000000000000000000"

const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const volumeMethod = "/volume"

const maxRetriesCount = 3

const fetch: any = async (options: FetchOptions) => {
    for (let tryCount = 0; tryCount < maxRetriesCount; ++tryCount) {
        try {
            console.log(`Query Volume ...`)
            const response = await axios.get(apiBaseURL + volumeMethod)

            const volume = options.createBalances()
            const dailyVolume = options.createBalances()
            volume.add(BNB_ADDRESS, response.data.volume)
            dailyVolume.add(BNB_ADDRESS, response.data.dailyVolume)

            const totalVolume = Number(response.data.volume) / 10 ** 18
            console.log(`Got Volume: ${totalVolume} BNB`, response.data.volume)
            console.log(`Got Daily Volume: ${Number(response.data.dailyVolume) / 10 ** 18} BNB`, response.data.dailyVolume)
            return { totalVolume: volume, dailyVolume }
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
            // start: '2024-12-01'
        },
    },
}

import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

const BNB_ADDRESS = "0xc748673057861a797275cd8a068abb95a902e8de"
const BASE_ADDRESS = "0x58ecEF26335Af7b04A998105a6603B0Dc475aF33"
const apiBaseURL = "" // todo
const volumeMethod = "/volume"
const feesMethod = "/fees"

const fetch = async (options: FetchOptions) => {
    const params = { chain: options.chain }
    const volumeResponse = await httpGet(apiBaseURL + volumeMethod, { params })
    const feesResponse = await httpGet(apiBaseURL + feesMethod, { params })

    let tokenAddress: string = ADDRESSES.null

    if (options.chain === CHAIN.BSC) tokenAddress = BNB_ADDRESS
    if (options.chain === CHAIN.BASE) tokenAddress = BASE_ADDRESS

    const volume = options.createBalances()
    const dailyVolume = options.createBalances()
    volume.add(tokenAddress, volumeResponse.volume)
    dailyVolume.add(tokenAddress, volumeResponse.dailyVolume)

    const fees = options.createBalances()
    const dailyFees = options.createBalances()
    const revenue = options.createBalances()
    const dailyRevenue = options.createBalances()

    fees.add(tokenAddress, feesResponse.totalFee)
    dailyFees.add(tokenAddress, feesResponse.dailyTotalFee)

    // Fees <=> Revenue for the project
    revenue.add(tokenAddress, feesResponse.totalFee)
    dailyRevenue.add(tokenAddress, feesResponse.dailyTotalFee)

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
            meta: {
                methodology: {
                    Fees: "Fees from send and fulfill operation across the bridge.",
                    Revenue: "All fees are revenue.",
                }
            }
        },
        [CHAIN.BASE]: {
            fetch: fetch,
            meta: {
                methodology: {
                    Fees: "Fees from send and fulfill operation across the bridge.",
                    Revenue: "All fees are revenue.",
                }
            }
        },
    },
}

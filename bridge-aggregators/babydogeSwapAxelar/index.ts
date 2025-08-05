import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { httpGet } from "../../utils/fetchURL"

const BNB_ADDRESS = "0xc748673057861a797275cd8a068abb95a902e8de"
const BASE_ADDRESS = "0x58ecEF26335Af7b04A998105a6603B0Dc475aF33"
const apiBaseURLDev = "https://baby-axelar-bridge-connector-backend-dev.dev.babyparrot.xyz/lama-api"
const apiBaseURLProd = "https://axelar-bridge-connector-backend-main.babybulldog.xyz/lama-api"
const volumeMethod = "/volume"
const feesMethod = "/fees"

const url = apiBaseURLProd

const CHAIN_MAP = {
    [CHAIN.BSC]: 56,
    [CHAIN.BASE]: 8453,
}

const fetch = async (options: FetchOptions) => {
    const params = { chain_id: CHAIN_MAP[options.chain] }
    const volumeResponse = await httpGet(url + volumeMethod, { params })
    const feesResponse = await httpGet(url + feesMethod, { params })

    console.log(`Fetched volume and fees for ${options.chain} chain:`, volumeResponse, feesResponse, params)

    return {
        totalVolume: volumeResponse.totalVolume,
        dailyVolume: volumeResponse.dailyVolume,
        totalFees: feesResponse.totalFees,
        dailyFees: feesResponse.dailyFees,
        totalRevenue: feesResponse.totalFees, // revenue = fees
        dailyRevenue: feesResponse.dailyFees, // revenue = fees
    }
}

export default {
    version: 2,
    start: '2025-08-05',
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

import { ethers, Interface } from "ethers";
import { FetchOptions } from "../../adapters/types";
import { getLatestBlock, lookupBlock } from "@defillama/sdk/build/util";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';
import { getTokenTransfers } from "@defillama/sdk/build/util/indexer";
import { httpGet } from "../../utils/fetchURL";

const TOKEN_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
const TOKEN_DECIMALS = 18
const WALLET_ADDRESS = "0x3f0F3359A168b90C7F45621Dde5A4cDc3C61529D"
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const volumeMethod = "/volume"
const feesMethod = "/fees"

const fetch = async (options: FetchOptions) => {
    const now = Math.round(Date.now() / 1000)
    const DAY = 86400

    // Create balance containers
    const totalFees = options.createBalances()
    const dailyFees = options.createBalances()
    const totalRevenue = options.createBalances()
    const dailyRevenue = options.createBalances()

    const fromBlock = await lookupBlock(now - DAY)
    const balancesKey = `bsc:${TOKEN_ADDRESS.toLowerCase()}`

    const tokensReceivedTotal = await addTokensReceived({
        options,
        tokens: [TOKEN_ADDRESS],
        targets: [WALLET_ADDRESS],
    })

    const totalIncome = tokensReceivedTotal.getBalances()[balancesKey]

    options.getFromBlock = async () => fromBlock.number
    const tokensReceivedDaily = await addTokensReceived({
        options,
        tokens: [TOKEN_ADDRESS],
        targets: [WALLET_ADDRESS],
    })
    const dailyIncome = tokensReceivedDaily.getBalances()[balancesKey]

    console.log({ totalIncome, dailyIncome })

    totalFees.add(TOKEN_ADDRESS, totalIncome)
    dailyFees.add(TOKEN_ADDRESS, dailyIncome)
    totalRevenue.add(TOKEN_ADDRESS, totalIncome)
    dailyRevenue.add(TOKEN_ADDRESS, dailyIncome)

    const volumeResponse = await httpGet(apiBaseURL + volumeMethod)

    const totalVolume = options.createBalances()
    const dailyVolume = options.createBalances()
    totalVolume.add(TOKEN_ADDRESS, volumeResponse.volume)
    dailyVolume.add(TOKEN_ADDRESS, volumeResponse.dailyVolume)

    return {
        totalVolume,
        dailyVolume,
        totalFees,
        dailyFees,
        totalRevenue,
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

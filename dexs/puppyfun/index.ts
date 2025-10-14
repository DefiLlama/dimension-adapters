import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';
import { httpGet } from "../../utils/fetchURL";

const TOKEN_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
const WALLET_ADDRESS = "0x3f0F3359A168b90C7F45621Dde5A4cDc3C61529D"

const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const volumeMethod = "/volume"

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const balancesKey = `bsc:${TOKEN_ADDRESS.toLowerCase()}`
  const tokensReceivedDaily = await addTokensReceived({
    options,
    tokens: [TOKEN_ADDRESS],
    targets: [WALLET_ADDRESS],
  })

  const dailyIncome = tokensReceivedDaily.getBalances()[balancesKey]
  dailyFees.add(TOKEN_ADDRESS, dailyIncome)
  dailyRevenue.add(TOKEN_ADDRESS, dailyIncome)

  const volumeResponse = await httpGet(apiBaseURL + volumeMethod)
  const dailyVolume = options.createBalances()
  dailyVolume.add(TOKEN_ADDRESS, volumeResponse.dailyVolume)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  methodology: {
    Fees: "Token trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
  }
}

export default adapter
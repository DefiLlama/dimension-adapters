import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived, getETHReceived, nullAddress } from '../../helpers/token';
import fetchURL from "../../utils/fetchURL";

const TOKEN_ADDRESS = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"
const WALLET_ADDRESS = "0x3f0F3359A168b90C7F45621Dde5A4cDc3C61529D"

const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const volumeMethod = "/volume"

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const balancesKeyERC20 = `bsc:${TOKEN_ADDRESS.toLowerCase()}`
  const balancesKeyBNB = `bsc:${nullAddress.toLowerCase()}`
  const tokensReceivedDaily = await addTokensReceived({
    options,
    tokens: [TOKEN_ADDRESS],
    targets: [WALLET_ADDRESS],
  })
  const nativeReceivedDaily = await getETHReceived({
    options,
    target: WALLET_ADDRESS,
  })

  const dailyIncomeERC20 = tokensReceivedDaily.getBalances()[balancesKeyERC20]
  const dailyIncomeBNB = nativeReceivedDaily.getBalances()[balancesKeyBNB]

  // ERC20 fees
  dailyFees.add(TOKEN_ADDRESS, dailyIncomeERC20)
  dailyRevenue.add(TOKEN_ADDRESS, dailyIncomeBNB)

  // BNB fees
  dailyFees.add(nullAddress, dailyIncomeERC20)
  dailyRevenue.add(nullAddress, dailyIncomeBNB)

  const volumeResponse = await fetchURL(apiBaseURL + volumeMethod)
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
  runAtCurrTime: true,
  chains: [CHAIN.BSC],
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "Token trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
  }
}

export default adapter
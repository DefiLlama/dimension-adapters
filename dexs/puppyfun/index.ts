import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from '../../helpers/token';
import fetchURL from "../../utils/fetchURL";
import ADDRESSES from "../../helpers/coreAssets.json"

const WALLET_ADDRESS = "0x3f0F3359A168b90C7F45621Dde5A4cDc3C61529D"

const apiBaseURL = "https://bd-fun-defilama-ts-backend-main.puppy.fun/lama-api"
const volumeMethod = "/volume"

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  await addTokensReceived({
    options,
    token: ADDRESSES.bsc.WBNB,
    target: WALLET_ADDRESS,
    balances: dailyFees,
  })

  const volumeResponse = await fetchURL(apiBaseURL + volumeMethod)
  const dailyVolume = options.createBalances()
  dailyVolume.add(ADDRESSES.bsc.WBNB, volumeResponse.dailyVolume)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, //api doesnt support hourly data
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
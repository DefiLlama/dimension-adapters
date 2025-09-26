import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";


export default {
  methodology: {
    Fees: '0.3% of each swap',
    Revenue: '0.05% of each swap',
    ProtocolRevenue: '0.05% of each swap',
    SupplySideRevenue: '0.25% of each swap',
    HoldersRevenue: 'N/A',
  },
  runAtCurrTime: true,
  chains: [CHAIN.PACASWAP],
  fetch: async () => {
    const data = await httpGet('https://api.pacaswap.com/mainnet/coingecko/tickers_complete')
    const dailyVolume = data.reduce((acc: number, i: any) => acc + +i.volume_usd, 0)
    const dailyFees = data.reduce((acc: number, i: any) => acc + +i.fees_usd, 0)

    return { dailyVolume, dailyFees, dailySupplySideRevenue: dailyFees * 0.25 / 0.3 , dailyProtocolRevenue: dailyFees * 0.05 / 0.3, dailyRevenue: dailyFees * 0.05 /0.3, dailyHoldersRevenue: 0  }
  },
}
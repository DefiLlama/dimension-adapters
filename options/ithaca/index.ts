import ADDRESSES from '../../helpers/coreAssets.json'
import { SimpleAdapter } from "../../adapters/types";
import fetchURL, { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";
import { parseUnits } from "ethers";

const WETH_CONTRACT = ADDRESSES.arbitrum.WETH;
const USDC_CONTRACT = ADDRESSES.arbitrum.USDC_CIRCLE;

interface IIthacaStatsResponse {
  "response": {
    "daily_fees": number,
    "total_fees": number,
    "daily_premium": number,
    "total_premium": number,
    "daily_volume_numeraire": number,
    "daily_volume_underlier": number,
    "total_volume_numeraire": number,
    "total_volume_underlier": number
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchIthacaVolumeData,
      start: '2024-04-15',
    },
  },
};

export async function fetchIthacaVolumeData(
  timestamp: number
) {
  const { response: ithacaStats } = await httpGet(`https://arb.ithacaprotocol.io/api/v1/analytics/WETH/USDC/stats`) as IIthacaStatsResponse;

  const dailyNotionalVolume = new Balances({ chain: CHAIN.ARBITRUM })
  dailyNotionalVolume.addToken(USDC_CONTRACT, parseUnits(ithacaStats.daily_volume_numeraire.toFixed(6), 6))
  dailyNotionalVolume.addToken(WETH_CONTRACT, parseUnits(`${ithacaStats.daily_volume_underlier}`, 18))

  const totalNotionalVolume = new Balances({ chain: CHAIN.ARBITRUM })
  totalNotionalVolume.addToken(USDC_CONTRACT, parseUnits(ithacaStats.total_volume_numeraire.toFixed(6), 6))
  totalNotionalVolume.addToken(WETH_CONTRACT, parseUnits(`${ithacaStats.total_volume_underlier}`, 18))

  return {
    timestamp,
    dailyFees: ithacaStats.daily_fees,
    dailyPremiumVolume: ithacaStats.daily_premium,
    dailyNotionalVolume,
  };
}

export default adapter;

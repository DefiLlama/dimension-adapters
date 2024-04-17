import { SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";
import { parseUnits } from "ethers";

const WETH_CONTRACT = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
const USDC_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

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
      start: 1713205800,
      runAtCurrTime: true
    },
  },
};

export async function fetchIthacaVolumeData(
  timestamp: number
) {
  const { response: ithacaStats } = await fetchURL(`https://app.ithacaprotocol.io/api/v1/analytics/WETH/USDC/stats`) as IIthacaStatsResponse;
  
  const dailyNotionalVolume = new Balances({ chain: CHAIN.ARBITRUM })
  dailyNotionalVolume.addToken(USDC_CONTRACT, parseUnits(ithacaStats.daily_volume_numeraire.toFixed(6), 6))
  dailyNotionalVolume.addToken(WETH_CONTRACT, parseUnits(`${ithacaStats.daily_volume_underlier}`, 18))

  const totalNotionalVolume = new Balances({ chain: CHAIN.ARBITRUM })
  totalNotionalVolume.addToken(USDC_CONTRACT, parseUnits(ithacaStats.total_volume_numeraire.toFixed(6), 6))
  totalNotionalVolume.addToken(WETH_CONTRACT, parseUnits(`${ithacaStats.total_volume_underlier}`, 18))

  return {
    timestamp,
    dailyFees: ithacaStats.daily_fees,
    totalFees: ithacaStats.total_fees,
    dailyPremiumVolume: ithacaStats.daily_premium,
    totalPremiumVolume: ithacaStats.total_premium,
    dailyNotionalVolume,
    totalNotionalVolume,
  };
}

export default adapter;

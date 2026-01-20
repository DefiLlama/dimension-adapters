//fees/pacifica.ts
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const fetch = async () => {
  const { data } = await fetchURL('https://api.pacifica.fi/api/v1/info/prices');
  const dailyVolume = data.reduce((a: number, b: { volume_24h: string }) => a + Number(b.volume_24h), 0);
  const avgFeeRate = 0.00035; // 0.035%
  const dailyFees = dailyVolume * avgFeeRate;
  const dailyRevenue = dailyFees * 0.2;
  
  return {
    dailyFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailyVolume: dailyVolume.toString(),
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2025-06-11',
      runAtCurrTime: true,
    },
  },
  methodology: {
    Fees: "Trading fees calculated from 24h volume. Base fees: 0.02% maker / 0.05% taker (average 0.035% assuming 50/50 split). Promotional discounts not included in calculation.",
    Revenue: "Estimated protocol revenue as 20% of total fees. Remaining 80% allocated to insurance fund and liquidity provider incentives.",
    Volume: "Total notional trading volume across all perpetual markets in the last 24 hours.",
  },
};

export default adapter;
import { getDexChainFees } from "../../helpers/getUniSubgraphFees";
import volumeAdapter from "../../dexs/SmarDex";
import { CHAIN } from "../../helpers/chains";
import type { Adapter } from "../../adapters/types";

// Define fees for each chain
const FEES = {
  [CHAIN.ETHEREUM]: { LP_FEES: 0.0005, POOL_FEES: 0.0002 },
  [CHAIN.BSC]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.POLYGON]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
  [CHAIN.ARBITRUM]: { LP_FEES: 0.0007, POOL_FEES: 0.0003 },
} as { [chain: string]: { LP_FEES: number; POOL_FEES: number } };

const adapter: Adapter = {
  adapter: {},
};

for (let chain in FEES) {
  const { LP_FEES, POOL_FEES } = FEES[chain];
  const TOTAL_FEES = LP_FEES + POOL_FEES;

  // Convert fees to percentages and round to two decimal places
  const totalFeesPercent = (TOTAL_FEES * 100).toFixed(2);
  const lpFeesPercent = (LP_FEES * 100).toFixed(2);
  const poolFeesPercent = (POOL_FEES * 100).toFixed(2);

  const baseAdapter = getDexChainFees({
    userFees: TOTAL_FEES,
    totalFees: TOTAL_FEES,
    supplySideRevenue: LP_FEES,
    revenue: POOL_FEES,
    holdersRevenue: POOL_FEES,
    volumeAdapter,
  });

  const methodology = {
    UserFees: `${totalFeesPercent}% of each swap is collected from the user that swaps as trading fees.`,
    Fees: `${totalFeesPercent}% of each swap is collected from the user that swaps as trading fees.`,
    Revenue: `${poolFeesPercent}% of each swap is collected for the staking pool (SDEX holders that staked).`,
    ProtocolRevenue: `Protocol has no revenue.`,
    SupplySideRevenue: `${lpFeesPercent}% of each swap is collected for the liquidity providers.`,
    HoldersRevenue: `${poolFeesPercent}% of each swap is collected for the staking pool (SDEX holders that staked).`,
  };

  adapter.adapter[chain] = {
    ...baseAdapter[chain],
    meta: {
      methodology,
    },
  };
}

export default adapter;

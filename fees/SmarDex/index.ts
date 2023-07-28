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

const poolFeesPercent = (FEES[CHAIN.ETHEREUM].POOL_FEES * 100).toFixed(2);
const lpFeesPercent = (FEES[CHAIN.ETHEREUM].LP_FEES * 100).toFixed(2);

const FEES_METHODOLOGY = `A minor fee is collected on each swap, functioning as a trading fees. The fees are set at ${
  FEES[CHAIN.ETHEREUM]
}% on Ethereum, and 0.1% on other chains. Please note, on these other networks, the fees can be revised and may vary between different pairs and chains. Refer to the tab marked https://docs.smardex.io/overview/what-is-smardex/fees for a comprehensive list of these details.`;
const methodology = {
  UserFees: FEES_METHODOLOGY,
  Fees: FEES_METHODOLOGY,
  Revenue: `${poolFeesPercent}% of each swap on Ethereum, is collected for the staking pool (SDEX holders that staked)`,
  ProtocolRevenue: `Protocol has no revenue.`,
  SupplySideRevenue: `${lpFeesPercent}% of each swap is collected for the liquidity providers.`,
  HoldersRevenue: `${poolFeesPercent}% of each swap is collected for the staking pool (SDEX holders that staked).`,
};
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

  adapter.adapter[chain] = {
    ...baseAdapter[chain],
    meta: {
      methodology,
    },
  };
}

export default adapter;

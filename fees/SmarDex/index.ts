import { getDexChainFees } from "../../helpers/getUniSubgraphFees";
import volumeAdapter from "../../dexs/SmarDex";
import { CHAIN } from "../../helpers/chains";
import type { Adapter } from "../../adapters/types";


const LP_FEES = 0.0005;
const POOL_FEES = 0.0002;
const TOTAL_FEES = LP_FEES + POOL_FEES;

const baseAdapter = getDexChainFees({
  userFees: TOTAL_FEES,
  totalFees: TOTAL_FEES,
  supplySideRevenue: LP_FEES,
  revenue: POOL_FEES,
  holdersRevenue: POOL_FEES,
  volumeAdapter,
});

const methodology = {
  UserFees: "0.07% of each swap is collected from the user that swaps as trading fees.",
  Fees: "0.07% of each swap is collected from the user that swaps as trading fees.",
  Revenue: "0.02% of each swap is collected for the staking pool (SDEX holders that staked).",
  ProtocolRevenue: `Protocol has no revenue.`,
  SupplySideRevenue: "0.05% of each swap is collected for the liquidity providers.",
  HoldersRevenue: "0.02% of each swap is collected for the staking pool (SDEX holders that staked)."
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      ...baseAdapter[CHAIN.ETHEREUM],
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;

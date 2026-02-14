import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { METRIC } from "../../helpers/metrics";

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: 'Users pay 0.25% fee on each token swap',
  },
  Fees: {
    [METRIC.SWAP_FEES]: 'Total swap fees collected from all trades, calculated as 0.25% of trade volume',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: '100% of swap fees distributed to liquidity providers who supply tokens to pools',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: 'Users pay 0.25% per swap.',
    UserFees: 'Users pay 0.25% per swap.',
    SupplySideRevenue: 'Swap fees distributed to LPs.',
  },
  breakdownMethodology,
  fetch: getUniV2LogAdapter({ factory: '0xac9d019B7c8B7a4bbAC64b2Dbf6791ED672ba98B', fees: 0.0025, userFeesRatio: 1, revenueRatio: 0 }),
  chains: [CHAIN.ARBITRUM],
  start: 1676505600,
}

export default adapter;



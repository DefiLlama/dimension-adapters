import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * https://docs.zircuit.com/build/liquidity-hub
 * Zircuit staking currently does not charge any on-chain fees or retain revenue.
 * All user yield comes from external LST/LRT protocols (stETH, Renzo, EigenLayer, etc.)
 * or off-chain ZRC point emissions. The staking contract merely holds deposits and
 * tracks off-chain points, so there is no internal yield, exchange-rate change,
 * performance fee, or protocol revenue to report.
 */
const fetch = async (_options: FetchOptions): Promise<FetchResultV2> => ({
  dailyFees: 0,
  dailyRevenue: 0,
  dailyProtocolRevenue: 0,
  dailySupplySideRevenue: 0,
});

const methodology = {
  Fees: "Zircuit does not charge any fees on staking deposits/withdrawals. All zircuit rewards are handled via off-chain point systems or external LST/LRT protocols.",
  Revenue: "No protocol revenue is collected by the Zircuit staking contract.",
  ProtocolRevenue: "Zircuit does not retain any staking rewards or take a cut of users’ yields.",
  SupplySideRevenue: "Users receive 100% of any external LST/LRT yields or ZRC point emissions",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM],
  methodology,
  start: "2024-06-01",
};

export default adapter;
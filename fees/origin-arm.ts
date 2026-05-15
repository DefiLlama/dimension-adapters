import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchOriginFees } from "../helpers/origin-protocol";

// Origin ARM (Auto-Rebalanced Market-maker) runs four vaults: three on
// Ethereum (Lido stETH, Ether.fi eETH, Ethena sUSDe/USDe) and one on Sonic
// (wS/OS). All roll up under the `origin-arm` DefiLlama protocol page.
const KEYS_BY_CHAIN: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: ["armWethSteth", "armWethEeth", "armSusdeUsde"],
  [CHAIN.SONIC]: ["armWsOs"],
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  return fetchOriginFees(KEYS_BY_CHAIN[options.chain] ?? [])(options);
};

const methodology = {
  Fees: "Profit earned by Origin ARM vaults from spread captured between LP redemptions and the underlying asset price (Lido stETH ARM, Ether.fi eETH ARM, Ethena sUSDe/USDe ARM, Sonic wS/OS ARM).",
  Revenue: "Origin's performance-fee share of ARM profit, apportioned from the protocol-wide revenue figure by ARM's share of total Origin fees.",
  HoldersRevenue: "Performance fee distributed to OGN stakers.",
  SupplySideRevenue: "Profit (net of performance fee) received by ARM vault depositors.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: '2024-10-24' },
    [CHAIN.SONIC]: { fetch, start: '2025-02-07' },
  },
};

export default adapter;

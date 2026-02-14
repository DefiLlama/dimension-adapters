import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { METRIC } from "../../helpers/metrics";

const methodology = {
  Fees: "A 0.3% trading fee is collected on all swaps",
  SupplySideRevenue: "All trading fees (0.3% of swap volume) are distributed to liquidity providers",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Trading fees collected from all swaps on AmpleSwap DEX (0.3% of trade volume)',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'All swap fees (0.3% of trade volume) distributed to liquidity providers',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch: getUniV2LogAdapter({ factory: '0x381fefadab5466bff0e8e76a143e8f73' }),
  chains: [CHAIN.BSC],
  start: '2021-09-10',
  methodology,
  breakdownMethodology,
}

export default adapter;

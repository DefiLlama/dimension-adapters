import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

// VectaSwap: a Uniswap V3 fork (byte-identical pools, standard PoolCreated and Swap events).
// No protocol fee is switched on (factory feeProtocol = 0), so every swap fee goes to LPs.
const factory = '0xe84FA17C2Ea423E0dea3C986EE3E1560D684bb2d' // same address on Arbitrum; add it there once pools trade

const fetch = getUniV3LogAdapter({ factory, userFeesRatio: 1, revenueRatio: 0, protocolRevenueRatio: 0 })

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: { fetch, start: '2026-10-29' },
  },
  methodology: {
    Volume: "Sum of the value of all swaps in VectaSwap V3 pools.",
    Fees: "Swap fees paid by traders (0.01%, 0.035%, 0.05%, 0.3% or 1% per pool).",
    UserFees: "Traders pay the pool's swap fee on every swap.",
    Revenue: "No protocol fee is charged on pool swaps: 0.",
    ProtocolRevenue: "No protocol fee is charged on pool swaps: 0.",
    SupplySideRevenue: "All swap fees go to liquidity providers.",
  },
};

export default adapter;

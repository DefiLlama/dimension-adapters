import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { getUniV3LogAdapter } from "../helpers/uniswap";

const config = {
  userFeesRatio: 1,
  revenueRatio: 0.8,
  protocolRevenueRatio: 0.8,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "User pays 0.3% fees on each swap.",
    UserFees: "User pays 0.3% fees on each swap.",
    SupplySideRevenue: "LPs receive 20% of swap fees.",
    ProtocolRevenue: "Treasury receives 80% of swap fees.",
    Revenue: "Treasury receives 80% of swap fees.",
  },
  fetch: getUniV3LogAdapter({ factory: '0xe52a36Bb76e8f40e1117db5Ff14Bd1f7b058B720', ...config }),
  chains: [CHAIN.OPTIMISM],
}

export default adapter;

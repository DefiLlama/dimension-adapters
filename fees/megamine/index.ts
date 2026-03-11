import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getETHReceived } from "../../helpers/token";

// const GRID_MINING = "0x04aa48b2a431a8bb163a00003a37db7f41209c5d";
// const TREASURY = "0x34cdb86ab4be37e5c5ed74bba2c0caf581c4e872";

// Replace this if your production feeCollector wallet is different.
// This adapter intentionally tracks the feeCollector wallet because
// GridMining now routes all protocol ETH there.
const FEE_COLLECTOR = "0x01ed2e5939bd5af2567bc23151e8354af8716298";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getETHReceived({
    options,
    target: FEE_COLLECTOR,
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All ETH retained by MegaMine from settled rounds and routed to the feeCollector wallet.",
  Revenue: "All retained ETH is protocol revenue.",
  ProtocolRevenue: "All retained ETH accrues to the protocol-controlled feeCollector wallet.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.MEGAETH],
  start: "2026-03-08",
  fetch,
  methodology,
  dependencies: [Dependencies.ALLIUM],
};

export default adapter;

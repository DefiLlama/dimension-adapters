import { CHAIN } from "../../helpers/chains";
import { createEvmChainFeesAdapter } from "../../helpers/evmChainFees";

// gateway1.iotex.me/analyzer/sumGasFeeIotx has returned 0 for every day since 2026-06-02,
// so gas fees are summed from RPC receipts instead. Revenue stays 0 as before.
export default createEvmChainFeesAdapter({
  chain: CHAIN.IOTEX,
  start: "2021-06-22",
  revenueShare: 0,
});

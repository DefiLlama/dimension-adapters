import { Adapter } from "../adapters/types";
import { OPTIMISM } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(OPTIMISM, "eth", 1386478800);

const adapter: Adapter = {
  adapter: feeAdapter,
  adapterType: "chain"
}

export default adapter;
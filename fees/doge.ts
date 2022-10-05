import { Adapter } from "../adapter.type";
import { DOGE } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(DOGE, "doge", 1386478800);

const adapter: Adapter = {
  adapter: feeAdapter,
  adapterType: "chain"
}

export default adapter;

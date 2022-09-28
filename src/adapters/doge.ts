import { FeeAdapter } from "../adapters.type";
import { DOGE } from "@defillama/adapters/volumes/helper/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(DOGE, "doge", 1386478800);

const adapter: FeeAdapter = {
  fees: feeAdapter,
  adapterType: "chain"
}

export default adapter;

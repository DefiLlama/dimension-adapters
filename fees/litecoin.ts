import { Adapter } from "../adapters/types";
import { LITECOIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(LITECOIN, "ltc", 1317960000);

const adapter: Adapter = {
  adapter: feeAdapter,
  adapterType: "chain"
}

export default adapter;

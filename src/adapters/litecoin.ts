import { FeeAdapter } from "../utils/adapters.type";
import { LITECOIN } from "@defillama/adapters/volumes/helper/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(LITECOIN, "ltc", 1317960000);

const adapter: FeeAdapter = {
  fees: feeAdapter,
  adapterType: "chain"
}

export default adapter;

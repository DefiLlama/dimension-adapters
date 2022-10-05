import { Adapter } from "../dexVolume.type";
import { LITECOIN } from "../helper/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(LITECOIN, "ltc", 1317960000);

const adapter: Adapter = {
  fees: feeAdapter,
  adapterType: "chain"
}

export default adapter;

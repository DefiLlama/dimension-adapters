import { Adapter } from "../dexVolume.type";
import { BITCOIN } from "../helper/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(BITCOIN, "btc", 1230958800);

const adapter: Adapter = {
  fees: feeAdapter,
  adapterType: "chain"
}

export default adapter;

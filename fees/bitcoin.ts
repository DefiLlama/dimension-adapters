import { Adapter, ProtocolType } from "../adapters/types";
import { BITCOIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(BITCOIN, "btc", 1230958800);

const adapter: Adapter = {
  adapter: feeAdapter,
  protocolType: ProtocolType.CHAIN
}

export default adapter;

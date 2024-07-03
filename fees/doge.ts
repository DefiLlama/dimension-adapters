import { Adapter, ProtocolType } from "../adapters/types";
import { DOGE } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(DOGE, "doge", 1386478800);

const adapter: Adapter = {
  version: 1,
  adapter: feeAdapter,
  protocolType: ProtocolType.CHAIN
}

export default adapter;

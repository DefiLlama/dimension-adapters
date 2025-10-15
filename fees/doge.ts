import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(CHAIN.DOGE, "doge", 1386478800);

const adapter: Adapter = {
  version: 1,
  adapter: feeAdapter,
  protocolType: ProtocolType.CHAIN
}

export default adapter;

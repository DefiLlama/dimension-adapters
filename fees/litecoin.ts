import { Adapter, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(CHAIN.LITECOIN, "ltc", 1317960000);

const adapter: Adapter = {
  adapter: feeAdapter,
  protocolType: ProtocolType.CHAIN
}

export default adapter;

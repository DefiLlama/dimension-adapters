import { Adapter, ProtocolType } from "../adapters/types";
import { LITECOIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(LITECOIN, "ltc", 1317960000);

const adapter: Adapter = {
  adapter: feeAdapter,
  protocolType: ProtocolType.CHAIN
}

export default adapter;

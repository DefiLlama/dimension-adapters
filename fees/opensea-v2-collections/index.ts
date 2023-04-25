import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const adapter: Adapter = {
  breakdown: getOpenseaCollections(1645228794),
  protocolType: ProtocolType.COLLECTION
}

export default adapter;

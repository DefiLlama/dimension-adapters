import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const adapter: Adapter = {
  breakdown: getOpenseaCollections(1655055510),
  protocolType: ProtocolType.COLLECTION
}

export default adapter;

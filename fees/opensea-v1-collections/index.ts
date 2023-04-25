import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const adapter: Adapter = {
  breakdown: getOpenseaCollections(1528911384),
  protocolType: ProtocolType.COLLECTION
}

export default adapter;

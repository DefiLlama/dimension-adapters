import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const seaportEndpoints = {
  [CHAIN.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/messari/opensea-seaport-ethereum',
}

const adapter: Adapter = {
  breakdown: getOpenseaCollections(seaportEndpoints, 1655055510),
  protocolType: ProtocolType.COLLECTION
}

export default adapter;

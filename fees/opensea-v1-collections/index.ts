import { Adapter, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const v1Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/opensea-v1-ethereum",
}

const adapter: Adapter = {
  breakdown: getOpenseaCollections(v1Endpoints, 1528911384),
  protocolType: ProtocolType.COLLECTION
}

export default adapter;

import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const seaportEndpoints = {
  [CHAIN.ETHEREUM]: 'https://api.thegraph.com/subgraphs/name/messari/opensea-seaport-ethereum',
}

const adapter: Adapter = {
  breakdown: getOpenseaCollections(seaportEndpoints)
}

export default adapter;

import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const v1Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/opensea-v1-ethereum",
}

const adapter: Adapter = {
  breakdown: getOpenseaCollections(v1Endpoints)
}

export default adapter;

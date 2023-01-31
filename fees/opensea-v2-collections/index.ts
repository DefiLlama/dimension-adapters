import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import getOpenseaCollections from "../../helpers/getOpenseaCollections"

const v2Endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/messari/opensea-v2-ethereum",
};

const adapter: Adapter = {
  breakdown: getOpenseaCollections(v2Endpoints)
}

export default adapter;

import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('4GX8RE9TzEWormbkayeGj4NQmmhYE46izVVUvXv8WPDh'),
};
const fetch = univ2Adapter({ endpoints });

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: 1672444800,
}

export default adapter

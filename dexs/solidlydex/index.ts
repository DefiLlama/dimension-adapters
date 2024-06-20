import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('4GX8RE9TzEWormbkayeGj4NQmmhYE46izVVUvXv8WPDh'),
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.ethereum.start = 1672444800;

export default adapter

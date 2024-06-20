import * as sdk from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
  [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('Cg4bWziUWqtUZrvZ6QZihsgUukAh6r8o5KZQzJRVkA31')
},{});
adapter.adapter.moonbeam.start = 1642032000;
export default adapter;

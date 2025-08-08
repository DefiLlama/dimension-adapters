import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('Cg4bWziUWqtUZrvZ6QZihsgUukAh6r8o5KZQzJRVkA31')
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.MOONBEAM],
}
export default adapter;

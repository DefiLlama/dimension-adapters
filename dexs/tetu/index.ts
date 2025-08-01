import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('D1aLXNYC1pZocgumq9yyKQMjFwZ14Gum3NUbZUA35Gty')
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.POLYGON],
  start: 1634863038,
}

export default adapter;

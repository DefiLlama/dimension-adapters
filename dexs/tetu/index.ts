import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('D1aLXNYC1pZocgumq9yyKQMjFwZ14Gum3NUbZUA35Gty')
}, {
});

adapters.adapter.polygon.start = 1634863038;
export default adapters;

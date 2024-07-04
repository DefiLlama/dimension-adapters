import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('7TYvKnsZnaihZ1x5V8LgMRuvv7N8VuaM21GVRXPK6WR6')
}, {
});

import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('A1pnYfdxjPz6WMTRtmhyFKYDvwSuAyAdckwsUVWvgd6F')
}, {});
adapters.adapter.polygon.start = 1652932015;
export default adapters;

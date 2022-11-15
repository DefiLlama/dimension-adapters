import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.CONFLUX]: "https://graphql.swappi.io/subgraphs/name/swappi-dex/swappi"
}, {
});

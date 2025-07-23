import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  // [CHAIN.MOONRIVER]: sdk.graph.modifyEndpoint('2Mi1JF6Rq5ZSBhrcomyXnCady3Fuwy8eyEPT95qitT9U'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('85ZjqMyuYVWcWWW7Ei8ptMyVRhwYwxGBHo83TmNJkw2U'),
  [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('HZrJDqzqR12BBUfmxaaPNbnSB9JunWzdzkpQaGYSHNcv'),
}, {});

adapters.adapter.bsc.start = 1620518400;
// adapters.adapter.moonriver.start = 1635638400;
adapters.adapter.moonbeam.start = 1642032000;
export default adapters;

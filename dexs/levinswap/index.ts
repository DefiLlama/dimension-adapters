import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.XDAI]: sdk.graph.modifyEndpoint('2gNP6y1kTvg6aAhus8DU8DyGS1cn5TvGD3S6VjjXCZZC')
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.XDAI],
  start: 1610767793,
}

export default adapter;

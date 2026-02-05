import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('56dMe6VDoxCisTvkgXw8an3aQbGR8oGhR292hSu6Rh3K')
  },
    factoriesName: "pyeFactories",
    dayData: "pyeDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BSC],
  start: 1660893036,
}

export default adapter;

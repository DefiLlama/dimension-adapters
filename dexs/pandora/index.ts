import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: "https://graphql.pandora.digital/subgraphs/name/pandora3"
  },
  factoriesName: "pandoraFactories",
  dayData: "pandoraDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BSC],
  start: 1652757593,
}

export default adapter;

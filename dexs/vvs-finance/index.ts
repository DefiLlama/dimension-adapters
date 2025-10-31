import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/vvs/exchange"
  },
  factoriesName: "vvsFactories",
  totalVolume: "totalVolumeUSD",
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.CRONOS],
  start: '2021-09-19'
}

export default adapter;

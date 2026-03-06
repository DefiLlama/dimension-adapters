import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.FINDORA]: "https://graph.findora.org/subgraphs/name/findora/venice",
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "veniceFactories",
  dayData: "veniceDayData",
});

const adapter: SimpleAdapter = {
  deadFrom: '2023-09-12',
  fetch,
  chains: [CHAIN.FINDORA],
  start: '2023-01-30',
}


export default adapter

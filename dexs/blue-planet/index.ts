import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('5Jo2jtiEVnVhSxHqzp24RUAjJrfeFPaZExxVwubTVBQ3')
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "planetFinanceFactories",
  dayData: "planetFinanceDayData"
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
}

export default adapter;
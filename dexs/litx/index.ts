import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('4b9bf8yyMfQBkjD94wmxFc4zf9ewhhQHhHfPqJrsSiq1'),
    [CHAIN.PULSECHAIN]: "https://api.algebra.finance/pulse-graph/subgraphs/name/cryptoalgebra/litx-analytics"
  },
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: { fetch: async () => ({ dailyVolume: 0 }), start: 1687305600 },
    [CHAIN.PULSECHAIN]: { fetch: async () => ({ dailyVolume: 0 }), start: 1686096000 },
  },
}

export default adapter;

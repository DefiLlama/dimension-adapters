import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('GQJoTmGyx4SGL1iVRBvyxA8jLNgcV8YMHcbLjf6DrUbv'),
  },
  factoriesName: "onePunchDatas",
  dayData: "onePunchDayData",
  dailyVolume: "dailyVolumnUSD",
  totalVolume: "totalVolumeUSD",
  hasTotalVolume: true,
});

const adapter: SimpleAdapter = {
  fetch,
  deadFrom: '2025-01-01',
  chains: [CHAIN.BSC],
  start: 1671580800,
}

export default adapter;

import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter(
  {
    [CHAIN.BSC]:
      sdk.graph.modifyEndpoint('GQJoTmGyx4SGL1iVRBvyxA8jLNgcV8YMHcbLjf6DrUbv'),
  },
  {
    factoriesName: "onePunchDatas",
    dayData: "onePunchDayData",
    dailyVolume: "dailyVolumnUSD",
    totalVolume: "totalVolumeUSD",
    hasTotalVolume: true,
  }
);
adapters.adapter.bsc.start = 1671580800;

export default adapters;

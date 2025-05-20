import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";
import { DISABLED_ADAPTER_KEY } from "../../adapters/types";

const endpoints = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('C9pjtfL9qqoHoCbLenWiztCBdT2YoG6rk3bHLaCMBS3H'),
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "lbfactories",
  dayData: "traderJoeDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD",
  dailyVolumeTimestampField: "date"
});

adapter.adapter.fantom.start = 1673827200;

// Metropolis was acquired by Swapline.
// Currently, both adapters (tvl) are the same code.
// We have set Metropolis TVL to 0.
// We counting volume for Metropolis,
// and use the exact same code (with a new listing
// since swapline recently launched)
adapter.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter
adapter.deadFrom = '2024-09-12';
export default adapter;

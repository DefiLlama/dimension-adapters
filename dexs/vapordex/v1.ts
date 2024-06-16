import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const v1 = univ2Adapter(
  {
    [CHAIN.AVAX]:
      sdk.graph.modifyEndpoint('B6Tur5gXGCcswG8rEtmwfjBqeyDXCDUQSwM9wUXHoui5'),
  },
  {
    factoriesName: "dexAmmProtocols",
    totalVolume: "cumulativeVolumeUSD",
    dayData: "financialsDailySnapshot",
    dailyVolume: "dailyVolumeUSD",
    dailyVolumeTimestampField: "timestamp",
  }
);

v1.adapter.avax.start = 1663545600;
export default v1.adapter;

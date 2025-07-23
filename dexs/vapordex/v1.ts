import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

// Create AVAX adapter with custom fields
const avaxAdapter = univ2Adapter2(
  {
    [CHAIN.AVAX]: sdk.graph.modifyEndpoint(
      "B6Tur5gXGCcswG8rEtmwfjBqeyDXCDUQSwM9wUXHoui5"
    ),
  },
  {
    factoriesName: "dexAmmProtocols",
    totalVolume: "cumulativeVolumeUSD",
    dayData: "financialsDailySnapshot",
    dailyVolume: "dailyVolumeUSD",
    dailyVolumeTimestampField: "timestamp",
  }
);

const apechainAdapter = univ2Adapter2(
  {
    [CHAIN.APECHAIN]:
      "https://api.goldsky.com/api/public/project_cloh4i8580dwo2nz7brhf4r6p/subgraphs/vapordex-v1-apechain/1.0.0/gn",
  },
  {} // Use default values
);

const adapter = {
  ...avaxAdapter.adapter,
  ...apechainAdapter.adapter,
};

adapter.avax.start = 1663545600;
adapter.apechain.start = 2519744;
export default adapter;

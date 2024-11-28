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
    [CHAIN.APECHAIN]: sdk.graph.modifyEndpoint(
      "QmUpkSrGVym7Qv2akaJkCm8HZzH2wyfdzuFoYW9mrX83eA"
    ),
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

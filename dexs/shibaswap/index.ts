import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('FvP7tK71rX51wsb663j5GRx2YTtDRa1Adq8QSCi5akLS'),
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "factories",
  dayData: "dayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD"
});

adapter.adapter.ethereum.start = 1625566975;

export default adapter

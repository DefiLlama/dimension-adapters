import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('CfBvQzwWyg41ceiR3XM64KzJiAKVPML4iztwEaHYdCFw'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8CtcD8EzHq6YyQrnb4XFz2pnwXVx3nHruj4pcDjHRKpt'),
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-xdai-v2"
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "swaprFactories",
  dayData: "swaprDayData",
  totalVolume: "totalVolumeUSD",
  dailyVolume: "dailyVolumeUSD"
});

export default adapter

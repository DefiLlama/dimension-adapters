import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-mainnet-v2",
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-arbitrum-one-v3",
  [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-xdai-v2"
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "swaprFactories",
  dayData: "swaprDayData",
  totalVolume: "totalVolumeUSD",
  dailyVolume: "dailyVolumeUSD"
});

export default adapter

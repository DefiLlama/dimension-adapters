import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/yoshiexchange/yoshi-exchange",
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/yoshiexchange/yoshi-exchange-bsc",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/yoshiexchange/yoshi-exchange-eth",
};

export default univ2Adapter(endpoints, {
    factoriesName: "factories",
    dayData: "dayData",
    dailyVolume: "volumeUSD",
    totalVolume: "volumeUSD",
    gasToken: "coingecko:fantom"
});

import { time } from "console";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/60365/zksync-zkswap/v0.0.5"
}

const blacklistTokens = {
  [CHAIN.ERA]: [
    '0x47260090ce5e83454d5f05a0abbb2c953835f777'
  ]
}

const graph = getGraphDimensions({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "dailyVolumeUSD",
  },
  blacklistTokens
});

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: async (timestamp: number) => {
        const data = await graph(CHAIN.ERA)(timestamp, {});
        data.totalVolume = undefined;
        return {
          ...data
        };
      },
      start: async () => 1700524800,
    }
  }
}
export default adapters;

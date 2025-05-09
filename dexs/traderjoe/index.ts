import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { BreakdownAdapter,  } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume, } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('9ZjERoA7jGANYNz1YNuFMBt11fK44krveEhzssJTWokM'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('3VgCBQh13PseR81hPNAbKua3gD8b8r33LauKjVnMbSAs'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('3jFnXqk6UXZyciPu5jfUuPR7kzGXPSndsLNrWXQ6xAxk'),
};
type TEndpoint = {
  [s: string | Chain]: string;
}
const endpointsV2: TEndpoint = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('6KD9JYCg2qa3TxNK3tLdhj5zuZTABoLLNcnUZXKG9vuH'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('9RoEdAwZiP651miLbKLYQczjckg7HxmyoKXWYXBDYsJc'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('9ANwfoCsnDa2fREYqEpGxWcTQHsmBDeTkdSDXGYAspN7'),
  [CHAIN.ETHEREUM]: "https://barn.traderjoexyz.com/v1/dex/analytics/ethereum?startTime=1695513600&aggregateBy=daily"
}

const graphsV1 = getChainVolume({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "volumeUSD",
  },
});


const graphsV2 = getChainVolume({
  graphUrls: endpointsV2,
  totalVolume: {
    factory: "lbfactories",
    field: "volumeUSD",
  },
});

const adapter: BreakdownAdapter = {
  version: 1,
  breakdown: {
    v1: {
      [CHAIN.AVAX]: {
        fetch: graphsV1(CHAIN.AVAX),
        start: '2021-08-09',
      },
      [CHAIN.BSC]: {
        fetch: graphsV1(CHAIN.BSC),
        start: '2022-10-04',
      },
      [CHAIN.ARBITRUM]: {
        fetch: graphsV1(CHAIN.ARBITRUM),
        start: '2022-10-04',
      },
    },
    v2: {
      [CHAIN.AVAX]: {
        fetch: graphsV2(CHAIN.AVAX),
        start: '2022-11-16'
      },
      [CHAIN.ARBITRUM]: {
        fetch: graphsV2(CHAIN.ARBITRUM),
        start: '2022-12-26'
      },
      [CHAIN.BSC]: {
        fetch: graphsV2(CHAIN.BSC),
        start: '2023-03-03'
      },
      // [CHAIN.ETHEREUM]: {
      //   fetch: fetchV2,
      //   start: '2023-09-24'
      // }
    }
  },
};

export default adapter;

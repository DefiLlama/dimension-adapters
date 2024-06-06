import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { queryDune } from "../../helpers/dune";
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";

type TChain = {
    [key: string]: string;
  };

const CHAINS: TChain = {
  [CHAIN.POLYGON]: "polygon",
  [CHAIN.XDAI]: "gnosis",
  [CHAIN.ARBITRUM]: "arbitrum"
};

const fetch = async (options: FetchOptions) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000));
  const data = await queryDune("3800632", { endTime: unixTimestamp, blockchain: options.chain });

  return {
    dailyVolume: data[0].daily_volume,
    totalVolume: data[0].total_volume,
    timestamp: unixTimestamp,
  };
};

const adapter: any = {
    version: 2,
    adapter: {
      ...Object.values(CHAINS).reduce((acc, chain) => {
        return {
          ...acc,
          [chain]: {
            fetch: fetch,
            start: 1717372800,
          },
        };
      }, {}),
    },
  };

export default adapter;

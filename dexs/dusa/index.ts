import { Adapter } from "../../adapters/types";
// import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, FetchResultVolume } from "../../adapters/types";
// import { CHAIN } from "../../helpers/chains";
import { getChainVolume, getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

// type TEndpoint = {
//     [s: string | Chain]: string;
//   }
// const endpoints: TEndpoint = {
//     [CHAIN.MASSA]: "https://api-mainnet-dusa.up.railway.app/volume"
//   }

  type TEndpoint = {
    [s: string]: string;
  }
const endpoints: TEndpoint = {
    ["massa"]: "https://api-mainnet-dusa.up.railway.app/volume"
  }

interface IVolume {
    timestamp: number;
    volumeUsd: number;
  }
  const fetchVolume = async (options: FetchOptions): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000))
    const historicalVolume: IVolume[] = (await fetchURL(endpoints[options.chain]));
    const totalVolume = historicalVolume
      .filter(volItem => volItem.timestamp <= dayTimestamp)
      .reduce((acc, { volumeUsd }) => acc + Number(volumeUsd), 0)
  
    const dailyVolume = historicalVolume
      .find(dayItem => dayItem.timestamp === dayTimestamp)?.volumeUsd
    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume !== undefined ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    }
  }

const graphs = getChainVolume({
    graphUrls: endpoints,
    totalVolume: {
      factory: "lbfactories",
      field: "volumeUSD",
    },
    dailyVolume: {
      factory: "DusaDayData",
      field: "volumeUSD",
      dateField: "date"
    },
  });

// const adapter: Adapter = {
//     adapter: {
//         massa: {
//             fetch: graphs(CHAIN.MASSA),
//             start: 1713170000,
//         },
//     },
// };

const adapter: Adapter = {
    adapter: {
        massa: {
            fetch: graphs("massa"),
            start: 1713170000,
        },
    },
};

export default adapter;

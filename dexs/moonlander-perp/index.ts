import { httpGet, httpPost } from "../../utils/fetchURL";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const totalEndpoint = "https://api.moonlander.trade/v1/trading-volumes/sum-all";
const dailyEndpoint =
  "https://api.moonlander.trade/v1/trading-volumes/sum-by-date";

const chains: { [key: string]: string } = {
  [CHAIN.CRONOS]: "CRONOS",
  [CHAIN.CRONOS_ZKEVM]: "CRONOS_ZKEVM",
};

const getTotalUri = ({ chain }: { chain: string }) => {
  return `${totalEndpoint}?chains=${chains[chain]}`;
};

const getDailyUri = ({
  chain,
  startTime,
  endTime,
}: {
  chain: string;
  startTime: Date;
  endTime: Date;
}) => {
  return `${dailyEndpoint}?chains=${
    chains[chain]
  }&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
};

interface APIResponse {
  vol: string;
  usdVol: string;
}

const getFetch =
  (chain: string): Fetch =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );

    const endTimestamp = dayTimestamp + 86400; // 86400 = 24 hours * 60 minutes * 60 seconds

    const dailyData: APIResponse = await httpGet(
      getDailyUri({
        chain,
        startTime: new Date(dayTimestamp * 1000),
        endTime: new Date(endTimestamp * 1000),
      })
    );
    const totalData: APIResponse = await httpGet(getTotalUri({ chain }));

    return {
      timestamp: dayTimestamp,
      dailyVolume: dailyData.usdVol,
      totalVolume: totalData.usdVol,
    };
  };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.CRONOS]: 1745919647,
  [CHAIN.CRONOS_ZKEVM]: 1734431393,
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(chains).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: getFetch(chain),
        start: startTimestamps[chain],
      },
    };
  }, {}),
};

export default adapter;

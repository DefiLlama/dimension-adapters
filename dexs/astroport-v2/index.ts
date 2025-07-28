import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL";

type IRequest = {
  [key: string]: Promise<any>;
};
const requests: IRequest = {};

const fetchCacheURL = (url: string) => {
  const key = url;
  if (!requests[key]) {
    requests[key] = fetchURL(url);
  }
  return requests[key];
};

const url =
  "https://cockpit.astroport.fi/api/trpc/protocol.stats,charts.protocol,charts.protocol,charts.protocol,charts.protocol,charts.astroTvl,charts.astroApy?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%2C%22meta%22%3A%7B%22values%22%3A%5B%22undefined%22%5D%7D%7D%2C%221%22%3A%7B%22json%22%3A%7B%22type%22%3A%22liquidity%22%2C%22dateRange%22%3A%22D30%22%7D%7D%2C%222%22%3A%7B%22json%22%3A%7B%22type%22%3A%22volume%22%2C%22dateRange%22%3A%22D30%22%7D%7D%2C%223%22%3A%7B%22json%22%3A%7B%22type%22%3A%22fees%22%2C%22dateRange%22%3A%22D30%22%7D%7D%2C%224%22%3A%7B%22json%22%3A%7B%22type%22%3A%22efficiency%22%2C%22dateRange%22%3A%22D30%22%7D%7D%2C%225%22%3A%7B%22json%22%3A%7B%22dateRange%22%3A%22D30%22%2C%22chainIds%22%3A%5B%22neutron-1%22%2C%22pacific-1%22%2C%22injective-1%22%2C%22osmosis-1%22%2C%22phoenix-1%22%5D%7D%7D%2C%226%22%3A%7B%22json%22%3A%7B%22dateRange%22%3A%22D30%22%7D%7D%7D";
const fetch = (chainId: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const results = (await fetchCacheURL(url))[0].result.data.json.chains[
      chainId
    ];
    const totalVolume24h = results?.dayVolumeUSD;
    const dailyFees = results?.dayFeesUSD;
    return {
      timestamp: dayTimestamp,
      dailyVolume: totalVolume24h ? String(totalVolume24h) : undefined,
      dailyFees,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    terra2: {
      fetch: fetch("phoenix-1"),
      runAtCurrTime: true,
    },
    [CHAIN.INJECTIVE]: {
      fetch: fetch("injective-1"),
      runAtCurrTime: true,
    },
    neutron: {
      fetch: fetch("neutron-1"),
      runAtCurrTime: true,
    },
    [CHAIN.SEI]: {
      fetch: fetch("pacific-1"),
      runAtCurrTime: true,
    },
    [CHAIN.OSMOSIS]: {
      fetch: fetch("osmosis-1"),
      runAtCurrTime: true,
    },
  },
};

export default adapter;

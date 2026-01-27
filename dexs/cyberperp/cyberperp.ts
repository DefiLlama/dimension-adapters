import { request, gql } from "graphql-request";
import { FetchOptions } from "../../adapters/types";
import BigNumber from "bignumber.js";
import fetchURL from "../../utils/fetchURL";

const graphUrl =
  "https://api.goldsky.com/api/public/project_clzwt9f7wxczz01vw8zx90k22/subgraphs/cyberLP-pool/latest/gn";

const cyberPerpApiUrl =
  "https://api.prod.move.cyberperp.io/stats/total-volume-range";

const VUSD_DECIMALS = 1e6;

const getData = async (timestamp: number) => {
  const query = gql`
    {
      volumeStats(first: 1, where: { period: daily, timestamp: ${timestamp} }) {
        id
        burn
        margin
        mint
        swap
        period
        timestamp
      }
    }
  `;

  const response = await request(graphUrl, query);
  let dailyVolume = new BigNumber(0);

  if (response.volumeStats) {
    const data = response.volumeStats[0];
    dailyVolume = dailyVolume
      .plus(new BigNumber(data.mint))
      // .plus(new BigNumber(data.swap)) // is not list spot
      .plus(new BigNumber(data.burn))
      .plus(new BigNumber(data.margin))
      .dividedBy(new BigNumber(1e30));
  }
  const _dailyVolume = dailyVolume.toString();
  return {
    dailyVolume: _dailyVolume,
    timestamp: timestamp,
  };
};

export const fetchVolume = async (options: FetchOptions) => {
  const data = await getData(options.startOfDay);
  return {
    dailyVolume: data.dailyVolume,
    timestamp: data.timestamp,
  };
};

export const fetch = async (options: FetchOptions) => {
  const { fromTimestamp, toTimestamp, createBalances, startOfDay } = options;

  const url = `${cyberPerpApiUrl}?fromTimestamp=${fromTimestamp}&toTimestamp=${toTimestamp}`;
  const volumeRaw = Number(await fetchURL(url));

  const dailyVolume = createBalances();
  dailyVolume.addUSDValue(volumeRaw / VUSD_DECIMALS);

  return {
    timestamp: startOfDay,
    dailyVolume,
  };
};

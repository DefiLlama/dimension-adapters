import { request, gql } from "graphql-request";
import { FetchOptions } from "../../adapters/types";
import BigNumber from "bignumber.js";

const graphUrl =
  "https://api.goldsky.com/api/public/project_clzelu5d634f501x8ai8111wj/subgraphs/zlp-pool/latest/gn";
const getData = async (timestamp: number) => {
  const query = gql`
    {
      volumeStats(first: 1, where: { period: daily, timestamp: ${timestamp} }) {
        id
        burn
        margin
        liquidation
        mint
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
      .plus(new BigNumber(data.liquidation))
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

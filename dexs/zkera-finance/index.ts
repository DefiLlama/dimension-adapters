import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import BigNumber from "bignumber.js";

const graphUrl =
  "https://api.goldsky.com/api/public/project_clzelu5d634f501x8ai8111wj/subgraphs/zlp-pool/latest/gn";

  const fetch = async (options: FetchOptions) => {
  const query = gql`
    {
      volumeStats(first: 1, where: { period: daily, timestamp: ${options.toTimestamp} }) {
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
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TELOS],
  start: '2021-07-31',
  deadFrom: "2025-11-20",
};

export default adapter;

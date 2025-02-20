import { CHAIN } from "../../helpers/chains";
import { FetchV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]:
    "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-arbitrum",
};

const methodology = {
  DailyVolume:
    "Volume from the sum of the open/close/liquidation of positions and liquidity positions.",
};

const queryTotalVolume = gql`
  query query_total($block: Int) {
    protocolState(id: "protocol_state", block: { number: $block }) {
      totalVolumeUSD
    }
  }
`;

interface ITotalResponse {
  protocolState: {
    totalVolumeUSD: number;
  };
}

const getFetch =
  () =>
  (chain: string): FetchV2 =>
  async ({ getStartBlock, getEndBlock }) => {
    const [startBlock, endBlock] = await Promise.all([
      getStartBlock(),
      getEndBlock(),
    ]);
    const [prevData, totalData]: ITotalResponse[] = await Promise.all([
      request(endpoints[chain], queryTotalVolume, {
        block: startBlock,
      }),
      request(endpoints[chain], queryTotalVolume, {
        block: endBlock,
      }),
    ]);

    const dailyVolume =
      totalData.protocolState.totalVolumeUSD -
      prevData.protocolState.totalVolumeUSD;

    return {
      dailyVolume,
      totalVolume: totalData.protocolState.totalVolumeUSD,
    };
  };

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFetch()(CHAIN.ARBITRUM),
      start: '2023-10-20',
      meta: {
        methodology: methodology,
      },
    },
  },
};

export default adapter;

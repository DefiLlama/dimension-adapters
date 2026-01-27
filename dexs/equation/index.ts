import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
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

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
    const [startBlock, endBlock] = await Promise.all([
      options.getStartBlock(),
      options.getEndBlock(),
    ]);
    const [prevData, totalData]: ITotalResponse[] = await Promise.all([
      request(endpoints[options.chain], queryTotalVolume, {
        block: startBlock,
      }),
      request(endpoints[options.chain], queryTotalVolume, {
        block: endBlock,
      }),
    ]);

    const dailyVolume =
      totalData.protocolState.totalVolumeUSD -
      prevData.protocolState.totalVolumeUSD;

    return {
      dailyVolume,
    };
  };

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  deadFrom: "2025-04-06",
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2023-10-20',
    },
  },
};

export default adapter;

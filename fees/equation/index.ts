import { request, gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { FetchV2, SimpleAdapter } from "../../adapters/types";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]:
    "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-arbitrum",
};

const methodology = {
  Fees: "Fees from open/close position and placed limit order (0.05%),  with invitation code (0.045%)",
  Revenue: "Revenue is 50% of all collected fees",
  ProtocolRevenue: "Revenue is 50% of all collected fees",
};

const queryTotalFee = gql`
  query query_total($block: Int) {
    protocolState(id: "protocol_state", block: { number: $block }) {
      totalFee
    }
  }
`;

const getFetch =
  () =>
  (chain: string): FetchV2 =>
  async ({ startTimestamp, getStartBlock, getEndBlock }) => {
    if (startTimestamp > 1743940800) return {}
    const [startBlock, endBlock] = await Promise.all([
      getStartBlock(),
      getEndBlock(),
    ]);
    const [prevData, totalData] = await Promise.all([
      request(endpoints[chain], queryTotalFee, {
        block: startBlock,
      }),
      request(endpoints[chain], queryTotalFee, {
        block: endBlock,
      }),
    ]);

    const dailyFees =
      totalData.protocolState.totalFee - prevData.protocolState.totalFee;

    return {
      dailyFees,
      dailyRevenue: dailyFees / 2,
      dailyProtocolRevenue: dailyFees / 2,
    };
  };

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: "2025-04-06",
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFetch()(CHAIN.ARBITRUM),
      start: '2023-10-20',
    },
  },
  methodology,
};

export default adapter;

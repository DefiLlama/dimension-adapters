import request, { gql } from "graphql-request";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/satoshi-perps-mainnet-stats-f0aca40abf13e5b5",
}

const feeStatsQuery = gql`
  query get_fees($period: String!, $id: String!) {
    feeStats(where: {period: $period, id: $id}) {
      marginAndLiquidation
      margin
      liquidation
    }
  }
`

interface IFeeResponse {
  feeStats: Array<{
    marginAndLiquidation: string,
    margin: string,
    liquidation: string,
    mint: string,
    burn: string,
    swap: string,
  }>
}

const fetch = (chain: string) => {
  return async (timestamp: number, _: any, __: FetchOptions): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))

    const graphQuery = gql
    `{
      feeStats(where: {timestamp:${dayTimestamp}}) {
        mint
        burn
        marginAndLiquidation
        swap
      }
    }`;
    const dailyData: IFeeResponse = await request(endpoints[chain], graphQuery, {
      id: String(dayTimestamp) + ':daily',
      period: 'daily',
    })

    const dailyMint = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.mint), 0)
    const dailyBurn = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.burn), 0)
    const dailySwap = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.swap), 0)
    const dailyMarginAndLiquidation = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.marginAndLiquidation), 0)

    // Calculate daily fees from margin and liquidation
    const dailyFees = (dailyMint + dailyBurn + dailySwap + dailyMarginAndLiquidation)/1e30


    // 60% to holders, 40% to protocol
    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: `${dailyFees * 0.4}`,
      dailyHoldersRevenue: `${dailyFees * 0.6}`,
      timestamp,
    };
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.CORE]: {
      fetch: fetch(CHAIN.CORE),
      start: '2024-12-23',
    },
  },
};

export default adapter;

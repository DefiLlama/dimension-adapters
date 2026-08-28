import request, { gql } from "graphql-request";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const graphQuery = gql
    `{
      feeStats(where: {timestamp:${options.startOfDay}}) {
        mint
        burn
        marginAndLiquidation
        swap
      }
    }`;
  const dailyData: IFeeResponse = await request(endpoints[options.chain], graphQuery, {
    id: String(options.startOfDay) + ':daily',
    period: 'daily',
  })

  const dailyMint = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.mint), 0)
  const dailyBurn = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.burn), 0)
  const dailySwap = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.swap), 0)
  const dailyMarginAndLiquidation = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.marginAndLiquidation), 0)

  // Calculate daily fees from margin and liquidation
  const dailyFees = (dailyMint + dailyBurn + dailySwap + dailyMarginAndLiquidation) / 1e30


  // 60% to holders, 40% to protocol
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: `${dailyFees * 0.4}`,
  };
};

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.CORE],
  start: '2024-12-23',
  fetch,
};

export default adapter;

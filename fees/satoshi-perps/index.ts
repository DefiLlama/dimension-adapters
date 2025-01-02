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
  }>
}

const fetch = (chain: string) => {
  return async (timestamp: number, _: any, __: FetchOptions): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    
    const dailyData: IFeeResponse = await request(endpoints[chain], feeStatsQuery, {
      id: chain === CHAIN.CORE
        ? String(dayTimestamp)
        : String(dayTimestamp) + ':daily',
      period: 'daily',
    })

    const totalData: IFeeResponse = await request(endpoints[chain], feeStatsQuery, {
      id: 'total',
      period: 'total',
    })

    // Calculate daily fees from margin and liquidation
    const dailyFees = dailyData.feeStats.length === 1
      ? Number(dailyData.feeStats[0].marginAndLiquidation) * 10 ** -30
      : 0

    // Calculate total fees
    const totalFees = totalData.feeStats.length === 1
      ? Number(totalData.feeStats[0].marginAndLiquidation) * 10 ** -30
      : 0

    // 60% to holders, 40% to protocol
    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyFees}`,
      dailyProtocolRevenue: `${dailyFees * 0.4}`,
      dailyHoldersRevenue: `${dailyFees * 0.6}`,
      totalFees: `${totalFees}`,
      timestamp,
    };
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.CORE]: {
      fetch: fetch(CHAIN.CORE),
      start: 1734914400,
    },
  },
};

export default adapter;
import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const config = {
  [CHAIN.CORE]: {
    start: '2025-06-01',
    endpoint: 'https://thegraph.coredao.org/subgraphs/name/volta-perps-mainnet-stat',
  }
}

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

const fetch = async (timestamp: number, _: any, options: FetchOptions)=> {
  const dayTimestamp = getTimestampAtStartOfDayUTC(timestamp)

  const graphQuery = gql
  `{
    feeStats(where: {timestamp:${dayTimestamp}}) {
      mint
      burn
      marginAndLiquidation
      swap
    }
  }`;
  const dailyData: IFeeResponse = await request(config[options.chain].endpoint, graphQuery, {
    id: String(dayTimestamp) + ':daily',
    period: 'daily',
  })

  const dailyMint = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.mint), 0)
  const dailyBurn = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.burn), 0)
  const dailySwap = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.swap), 0)
  const dailyMarginAndLiquidation = dailyData.feeStats.reduce((acc, fee) => acc + Number(fee.marginAndLiquidation), 0)

  const dailyFees = (dailyMint + dailyBurn + dailySwap + dailyMarginAndLiquidation)/1e30

  // 60% to holders, 40% to protocol
  return {
    dailyFees,
    dailyUsFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: `${dailyFees * 0.4}`,
    dailyHoldersRevenue: `${dailyFees * 0.6}`,
  };
};

const methodology = {
  Fees: 'Fees collected from users',
  Revenue: 'Total fees collected from users',
  ProtocolRevenue: '40% revenue goes to Protocol Revenue treasury',
  HoldersRevenue: '60% revenue goes to token holders',
};

const adapter: Adapter = {
  version: 1,
  methodology,
  adapter: Object.keys(config).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: config[chain].start,
      }
    }
  }, {})
};

export default adapter;

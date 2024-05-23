import { Adapter, ChainBlocks, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request from "graphql-request";
import BigNumber from "bignumber.js";

type TEndpoint = {
  [s: CHAIN | string]: string;
}
const endpoints: TEndpoint = {
  [CHAIN.OPTIMISM]: `https://api.thegraph.com/subgraphs/name/extrafi/extrasubgraph`,
  [CHAIN.BASE]: `https://api.thegraph.com/subgraphs/name/extrafi/extrafionbase`
}

interface IFeePaid {
  amount: string;
  asset: string;
}

interface ILendingPaid {
  eToken: string;
  value: string;
}

interface ILendingPool {
  eTokenAddress: string;
  exchangeRate: string;
  underlyingTokenAddress: string;
}

const graphs = (chain: CHAIN) => {
  return async (timestamp: number, _: ChainBlocks, { createBalances, startOfDay }: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = createBalances()

    const fromTimestamp = startOfDay - 60 * 60 * 24
    const toTimestamp = startOfDay

    const farmingQuery = `{
      feePaids(
        where: { blockTimestamp_lte: ${toTimestamp}, blockTimestamp_gte: ${fromTimestamp} },
        first: 1000
      ) {
        amount
        asset
      }
    }`
    const graphRes: IFeePaid[] = (await request(endpoints[chain], farmingQuery)).feePaids;

    const lendingQuery = `{
      mintToTreasuries(
        where: { blockTimestamp_lte: ${toTimestamp}, blockTimestamp_gte: ${fromTimestamp} },
        first: 1000
      ) {
        eToken
        value
      }
    }`
    const lendingGraphRes: ILendingPaid[] = (await request(endpoints[chain], lendingQuery)).mintToTreasuries;

    const lendingPoolsQuery = `{
      lendingReservePools(first: 1000) {
        eTokenAddress
        exchangeRate
        underlyingTokenAddress
      }
    }`
    const lendingPoolsGraphRes: ILendingPool[] = (await request(endpoints[chain], lendingPoolsQuery)).lendingReservePools;

    const lendingFeeList = lendingGraphRes.map((e: ILendingPaid) => {
      const targetPoolInfo = lendingPoolsGraphRes.find(poolInfo => {
        return e.eToken?.toLowerCase() === poolInfo.eTokenAddress?.toLowerCase()
      })
      if (targetPoolInfo) {
        const asset = targetPoolInfo.underlyingTokenAddress
        const amount = new BigNumber(e.value).multipliedBy(new BigNumber(targetPoolInfo.exchangeRate).div(new BigNumber(`1e+18`))).toFixed(0)
        return {
          asset,
          amount
        }
      }
      return {
        asset: e.eToken,
        amount: e.value
      }
    })

    const allFeesList = [...graphRes, ...lendingFeeList]

    allFeesList.map((e: IFeePaid) => {
      dailyFees.add(e.asset, e.amount)
    })

    const dailyRevenue = dailyFees.clone()
    dailyRevenue.resizeBy(0.5)

    return {
      timestamp: startOfDay,
      dailyFees, dailyRevenue,
    };
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: graphs(CHAIN.OPTIMISM),
      start: 1683450630,
    },
    [CHAIN.BASE]: {
      fetch: graphs(CHAIN.BASE),
      start: 1693449471,
    },
  },
};

export default adapter;

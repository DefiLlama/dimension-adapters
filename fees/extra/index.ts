import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request from "graphql-request";
import BigNumber from "bignumber.js";

type TEndpoint = {
  [s: CHAIN | string]: string;
}
const endpoints: TEndpoint = {
  [CHAIN.OPTIMISM]: `https://gateway-arbitrum.network.thegraph.com/api/a4998f968b8ad324eb3e47ed20c00220/subgraphs/id/3Htp5TKs6BHCcwAYRCoBD6R4X62ThLRv2JiBBikyYze`,
  [CHAIN.BASE]: `https://api.studio.thegraph.com/query/46015/extrafionbase/version/latest`
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
  return async ({ fromTimestamp, toTimestamp, createBalances }: FetchOptions) => {
    const dailyFees = createBalances()

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
      dailyFees, dailyRevenue,
    };
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: graphs(CHAIN.OPTIMISM),
      start: '2023-05-07',
    },
    [CHAIN.BASE]: {
      fetch: graphs(CHAIN.BASE),
      start: '2023-08-31',
    },
  },
};

export default adapter;

import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";
import request, { gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
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
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
    const fromTimestamp = todaysTimestamp - 60 * 60 * 24
    const toTimestamp = todaysTimestamp

    const farmingQuery = gql`{
      feePaids(
        where: { blockTimestamp_lte: ${toTimestamp}, blockTimestamp_gte: ${fromTimestamp} },
        first: 1000
      ) {
        amount
        asset
      }
    }`
    const graphRes: IFeePaid[] = (await request(endpoints[chain], farmingQuery)).feePaids;

    const lendingQuery = gql`{
      mintToTreasuries(
        where: { blockTimestamp_lte: ${toTimestamp}, blockTimestamp_gte: ${fromTimestamp} },
        first: 1000
      ) {
        eToken
        value
      }
    }`
    const lendingGraphRes: ILendingPaid[] = (await request(endpoints[chain], lendingQuery)).mintToTreasuries;

    const lendingPoolsQuery = gql`{
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

    const coins = [...new Set(allFeesList.map((e: IFeePaid) => `${chain}:${e.asset.toLowerCase()}`))]
    const prices = await getPrices(coins, todaysTimestamp);
    const dailyFees = allFeesList.map((e: IFeePaid) => {
      const decimals = prices[`${chain}:${e.asset.toLowerCase()}`]?.decimals;
      const price = prices[`${chain}:${e.asset.toLowerCase()}`]?.price;
      return new BigNumber(e.amount).dividedBy(new BigNumber(`1e+${decimals || 0}`)).toNumber() * (price || 0)
    }).reduce((a: number, b: number) => a + b, 0)


    return {
      dailyFees: `${dailyFees}`,
      dailyRevenue: `${dailyFees * 0.5}`,
      timestamp,
    };
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: graphs(CHAIN.OPTIMISM),
      start: async () => 1683450630,
    },
    [CHAIN.BASE]: {
      fetch: graphs(CHAIN.BASE),
      start: async () => 1693449471,
    },
  },
};

export default adapter;

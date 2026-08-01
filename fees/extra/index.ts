import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import request from "graphql-request";
import BigNumber from "bignumber.js";
import { METRIC } from "../../helpers/metrics";

const endpoints: Record<string, string> = {
  [CHAIN.OPTIMISM]: `https://gateway-arbitrum.network.thegraph.com/api/a4998f968b8ad324eb3e47ed20c00220/subgraphs/id/3Htp5TKs6BHCcwAYRCoBD6R4X62ThLRv2JiBBikyYze`,
  [CHAIN.BASE]: `https://gateway.thegraph.com/api/a4998f968b8ad324eb3e47ed20c00220/deployments/id/QmT6s8gNmKrshbuHz3636UgCLp9RkBKQmRh2zt4wzpnDpL`
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

const fetch = async ({ fromTimestamp, toTimestamp, createBalances, chain }: FetchOptions) => {
  const dailyFees = createBalances()
  const dailyHoldersRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const dailyRevenue = createBalances()
  const dailyProtocolRevenue = createBalances()

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

  lendingFeeList.map((e: IFeePaid) => {
    dailyFees.add(e.asset, e.amount, METRIC.BORROW_INTEREST)
  })
  dailySupplySideRevenue.add(dailyFees.clone(0.85))
  dailyRevenue.add(dailyFees.clone(0.15))
  dailyHoldersRevenue.add(dailyFees.clone(0.075))
  dailyProtocolRevenue.add(dailyFees.clone(0.075))
  graphRes.map((e: IFeePaid) => {
    dailyFees.add(e.asset, e.amount, "Leveraged Yield Farming fees")
    dailyRevenue.add(e.asset, e.amount, "Leveraged Yield Farming fees")
    dailyProtocolRevenue.add(e.asset, e.amount, "Leveraged Yield Farming fees")
  })

  return {
    dailyFees, 
    dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue
  };
};


const adapter: Adapter = {
  version: 2,
  methodology: {
    Fees: "Includes Leveraged Yield Farming fees like re-investment, borrowing, liquidation and price-range trigger fees plus the borrowing interest accrued",
    Revenue: "All Leveraged Yield Farming fees are revenue and the protocol collects a 15% performance fee on borrowing interest profit",
    SupplySideRevenue: "85% of the borrowing interest profit goes to lenders",
    ProtocolRevenue: "All Leveraged Yield Farming and 7.5% of the borrowing interest profits go to the protocol",
    HoldersRevenue: "5.25% of the borrowing interest profits are paid to veExtra holders and 2.25% are burned weekly"
  },
  breakdownMethodology: {
    Fees: {
      "Leveraged Yield Farming fees": "Includes re-investment, borrowing, liquidation and price-range trigger fees",
      [METRIC.BORROW_INTEREST]: "Borrowing interest accrued"
    },
    Revenue: {
      "Leveraged Yield Farming fees": "All re-investment, borrowing, liquidation and price-range trigger fees are revenue",
      [METRIC.BORROW_INTEREST]: "15% of the borrowing interest accrued is kept by the protocol"
    },
    ProtocolRevenue: {
      "Leveraged Yield Farming fees": "All re-investment, borrowing, liquidation and price-range trigger fees are revenue",
      [METRIC.BORROW_INTEREST]: "7.5% of the borrowing interest accrued goes to the protocol"
    },
    SupplySideRevenue: {
      [METRIC.BORROW_INTEREST]: "85% of the borrowing interest accrued goes to lenders"
    },
    HoldersRevenue: {
      [METRIC.BORROW_INTEREST]: "5.25% of the borrowing interest profits are paid to veExtra holders and 2.25% are burned weekly"
    },
  },
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch,
      start: '2023-05-07',
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2023-08-31',
    },
  },
};

export default adapter;

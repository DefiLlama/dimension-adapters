import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchOptions } from "../adapters/types"
import { METRIC } from "../helpers/metrics";


const endpoints = {
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('ktva51TWWq7t1hLnTGb88toXYtpxFo6gZfUC5NRnd9m'),
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('CnY2wTox8Pxh5t1UskQahPhMQdmuTmTAgwU62scUA8uM'),
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('Ak8GFBj7XruiuMd4nV3vfNzButNsj3pF7ogSBq6qdKcq'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('2RsqpTn7JBLs2sU775C7ZcM7oUrcZmpDhTnUbFCJWLfV'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('ASL3E8FZLN5AKxFoagSb7i3kFkDkMfoRovmDDLZAY8t4')
}

type DataResponse = {
  startValue: [{
    accrueInfoFeesEarned: number,
    accrueInfoFeesWithdrawn: number
  }]
  endValue: [{
    accrueInfoFeesEarned: number,
    accrueInfoFeesWithdrawn: number
  }]
}

const getFees = (data: DataResponse): number => {
  const startFees = data.startValue.reduce((prev, curr) => {
    return prev + Number(curr.accrueInfoFeesEarned) + Number(curr.accrueInfoFeesWithdrawn)
  }, 0)

  const endFees = data.endValue.reduce((prev, curr) => {
    return prev + Number(curr.accrueInfoFeesEarned) + Number(curr.accrueInfoFeesWithdrawn)
  }, 0)
  return endFees - startFees;
}

const fetch = async ({ getFromBlock, getToBlock, createBalances, chain}: FetchOptions) => {
  const [startBlock, endBlock] = await Promise.all([getFromBlock(), getToBlock()])
  const graphQuery = gql
  `query fees($startBlock: Int!, $endBlock: Int!) {
    startValue: cauldronFees(block: { number: $startBlock }) {
      accrueInfoFeesEarned
      accrueInfoFeesWithdrawn
    }
    endValue: cauldronFees(block: { number: $endBlock }) {
      accrueInfoFeesEarned
      accrueInfoFeesWithdrawn
    }
  }`;

  const graphRes: DataResponse = await request(endpoints[chain], graphQuery, {startBlock, endBlock});
  const dailyFeeAmount = getFees(graphRes);

  const dailyFees = createBalances();
  dailyFees.addCGToken('magic-internet-money', dailyFeeAmount, METRIC.BORROW_INTEREST);

  const dailyRevenue = dailyFees.clone(0.5, METRIC.PROTOCOL_FEES);

  const dailySupplySideRevenue = createBalances();
  const tempBalance = dailyFees.clone();
  tempBalance.subtract(dailyRevenue);
  dailySupplySideRevenue.addBalances(tempBalance, 'Lender Interest');

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total borrow interest accrued across all Cauldrons (Abracadabra's lending markets)",
  Revenue: "50% of borrow interest retained by the protocol",
  SupplySideRevenue: "50% of borrow interest distributed to MIM lenders",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest accrued from borrowers across all Cauldrons, including both fees earned and fees withdrawn',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: '50% of total borrow interest retained by the Abracadabra protocol',
  },
  SupplySideRevenue: {
    'Lender Interest': '50% of total borrow interest distributed to MIM lenders (users who supply liquidity)',
  },
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch,
        start: '2021-09-01',
    },
    [CHAIN.FANTOM]: {
        fetch,
        start: '2021-09-01',
    },
    [CHAIN.AVAX]: {
        fetch,
        start: '2021-09-01',
    },
    [CHAIN.BSC]: {
        fetch,
        start: '2021-09-01',
    },
    [CHAIN.ARBITRUM]: {
        fetch,
        start: '2021-09-01',
    },
  },
  methodology,
  breakdownMethodology,
}

export default adapter;

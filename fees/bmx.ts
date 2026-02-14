import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { FetchV2 } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { METRIC } from "../helpers/metrics";

const endpoints: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-base-stats/0.0.2/gn",
  [CHAIN.MODE]:
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-mode-stats/0.0.1/gn",
};

const methodology = {
  Fees: "Fees from open/close position (0.1%), liquidations, swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees:
    "Fees from open/close position (0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "10% of all collected fees are distributed to BMX stakers",
  SupplySideRevenue: "60% of all collected fees are distributed to BLT stakers",
  Revenue:
    "Revenue is 40% of all collected fees, which are distributed to BMX/wBLT LP stakers and BMX stakers",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: 'Fees from minting and burning BLT tokens based on the token balance in the liquidity pool',
    [METRIC.MARGIN_FEES]: 'Fees from opening and closing margin positions (0.1% of position size) and liquidation penalties',
    [METRIC.SWAP_FEES]: 'Fees from token swaps ranging from 0.2% to 0.8% based on pool composition and trading pair',
  },
  UserFees: {
    [METRIC.MARGIN_FEES]: 'Fees from opening and closing margin positions (0.1% of position size) and liquidation penalties paid by traders',
    [METRIC.SWAP_FEES]: 'Fees from token swaps ranging from 0.2% to 0.8% paid by users',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: '40% of all collected fees, distributed to BMX/wBLT LP stakers and BMX stakers',
  },
  HoldersRevenue: {
    [METRIC.PROTOCOL_FEES]: '40% of all collected fees, distributed to BMX/wBLT LP stakers and BMX stakers (same as Revenue)',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: '60% of all collected fees distributed to BLT stakers who provide liquidity to the pools',
  },
};

const graphs: FetchV2 = async ({ chain, endTimestamp }) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(endTimestamp);
  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

  const graphRes = await request(endpoints[chain], graphQuery);

  if (!graphRes.feeStat) {
    return {
      dailyFees: 0,
      dailyUserFees: 0,
      dailyRevenue: 0,
      dailyHoldersRevenue: 0,
      dailySupplySideRevenue: 0,
    }
  }

  const dailyFee =
    parseInt(graphRes.feeStat.mint) +
    parseInt(graphRes.feeStat.burn) +
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalDailyFee = dailyFee / 1e30;
  const userFee =
    parseInt(graphRes.feeStat.marginAndLiquidation) +
    parseInt(graphRes.feeStat.swap);
  const finalUserFee = userFee / 1e30;

  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.4).toString(),
    dailyHoldersRevenue: (finalDailyFee * 0.4).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.6).toString(),
  };
};

const adapter: Adapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch: graphs,
      start: '2023-09-10',
    },
    [CHAIN.MODE]: {
      fetch: graphs,
      start: '2024-07-10',
    },
  },
};

export default adapter;

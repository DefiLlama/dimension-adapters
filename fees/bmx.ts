import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { METRIC } from "../helpers/metrics";

const endpoints: { [key: string]: string } = {
  [CHAIN.BASE]: "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-base-stats/0.0.2/gn",
  [CHAIN.MODE]: "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-mode-stats/0.0.1/gn",
};

const methodology = {
  Fees: "Fees from open/close position (0.1%), liquidations, swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  Revenue: "Revenue is 40% of all collected fees, distributed to BMX/wBLT LP stakers and BMX stakers. Note: actual fee splits vary by product (Classic: 20%, Freestyle/Carousel: 60%, Deli Swap: 3%)",
  HoldersRevenue: "40% of all collected fees distributed to BMX stakers and BMX/wBLT LP stakers. Note: actual split varies by product",
  SupplySideRevenue: "60% of all collected fees distributed to BLT liquidity providers",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: 'Fees from minting and burning BLT tokens based on the token balance in the liquidity pool',
    [METRIC.MARGIN_FEES]: 'Fees from opening and closing margin positions (0.1% of position size) and liquidation penalties',
    [METRIC.SWAP_FEES]: 'Fees from token swaps ranging from 0.2% to 0.8% based on pool composition and trading pair',
  },
};

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.endTimestamp);
  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

  const res = await request(endpoints[options.chain], graphQuery);

  if (!res.feeStat) {
    return {
      dailyFees: 0,
      dailyUserFees: 0,
      dailyRevenue: 0,
      dailyHoldersRevenue: 0,
      dailySupplySideRevenue: 0,
    }
  }

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue((Number(res.feeStat.mint) + Number(res.feeStat.burn))/1e30, METRIC.MINT_REDEEM_FEES);
  dailyFees.addUSDValue(Number(res.feeStat.marginAndLiquidation)/1e30, METRIC.MARGIN_FEES);
  dailyFees.addUSDValue(Number(res.feeStat.swap)/1e30, METRIC.SWAP_FEES);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(dailyFees.clone(0.4));
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(dailyFees.clone(0.6));

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.BASE]: { start: '2023-09-10' },
    [CHAIN.MODE]: { start: '2024-07-10' },
  },
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet, httpPost } from "../../utils/fetchURL";

const API_URL = "https://api.mainnet.aptoslabs.com/decibel/api/v1/daily_stats";
const APTOS_GRAPHQL = "https://api.mainnet.aptoslabs.com/v1/graphql";

const FEE_TREASURY_ADDRESS =
  "0xa6ebf45cef6b683cf4275ee8c5f8f92f956a332174f8fd69143daf90115077f2";

const FEE_ASSET_TYPES = new Set([
  // Native USDC on Aptos (Circle CCTP)
  "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b",
  // USDCbl
  "0x96401f1e3ab3245d056d5a1ba67eef066ac3edc4d5f1b16adc5d567e79a845b0",
]);

const USD_DECIMALS = 1e6;

interface DailyStatsResponse {
  daily_volume: number;
  daily_fees: number;
  daily_revenue: number;
  open_interest: number;
}

const getTreasuryDepositsUsd = async (
  fromTimestamp: number,
  toTimestamp: number
): Promise<number> => {
  const fromDate = new Date(fromTimestamp * 1000).toISOString();
  const toDate = new Date(toTimestamp * 1000).toISOString();

  // Note: filtering by asset_type alongside owner_address triggers a slow query plan on
  // the Aptos indexer, so we fetch all deposits to the treasury in the window and filter
  // to the fee-bearing asset types client-side.
  const query = {
    query: `
      query GetTreasuryDeposits($owner: String!, $fromDate: timestamp!, $toDate: timestamp!) {
        fungible_asset_activities(
          where: {
            owner_address: { _eq: $owner },
            type: { _eq: "0x1::fungible_asset::Deposit" },
            transaction_timestamp: { _gte: $fromDate, _lt: $toDate }
          }
        ) {
          amount
          asset_type
        }
      }
    `,
    variables: {
      owner: FEE_TREASURY_ADDRESS,
      fromDate,
      toDate,
    },
  };

  const response = await httpPost(APTOS_GRAPHQL, query, {
    headers: { Authorization: `Bearer ${getEnv("DECIBEL_API_KEY")}` },
  });
  const activities: { amount: string; asset_type: string }[] =
    response?.data?.fungible_asset_activities || [];

  let total = 0;
  for (const activity of activities) {
    if (FEE_ASSET_TYPES.has(activity.asset_type)) {
      total += Number(activity.amount) / USD_DECIMALS;
    }
  }
  return total;
};

const fetch = async (options: FetchOptions) => {
  const url = `${API_URL}?start_timestamp=${options.startTimestamp}&end_timestamp=${options.endTimestamp}`;
  const [data, treasuryDepositsUsd] = await Promise.all([
    httpGet(url, {
      headers: { Authorization: `Bearer ${getEnv("DECIBEL_API_KEY")}` },
    }) as Promise<DailyStatsResponse>,
    getTreasuryDepositsUsd(options.fromTimestamp, options.toTimestamp),
  ]);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(data.daily_fees, "Taker Trading Fees");
  dailyFees.addUSDValue(treasuryDepositsUsd, "Treasury Deposits");

  dailyRevenue.addUSDValue(data.daily_revenue, 'Taker Trading Fees To Protocol');
  dailyRevenue.addUSDValue(treasuryDepositsUsd, "Treasury Deposits");

  dailySupplySideRevenue.addUSDValue(data.daily_fees - data.daily_revenue, 'Maker Rebates');

  return {
    dailyVolume: data.daily_volume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    openInterestAtEnd: data.open_interest,
  };
};

const methodology = {
  Volume: "Sum of notional value of all taker fills across perpetual futures markets.",
  Fees: "Trading fees collected from takers on all perpetual futures markets, plus USDC and USDCbl deposits to the protocol fee treasury.",
  Revenue: "Net protocol revenue after maker rebates, plus USDC and USDCbl deposits to the protocol fee treasury.",
  SupplySideRevenue: "Maker rebates paid back to liquidity-providing makers out of the trading fees."
};

const breakdownMethodology = {
  Fees: {
    'Taker Trading Fees': 'Trading fees collected from takers on all perpetual futures markets.',
    'Treasury Deposits': 'USDC and USDCbl deposits to the protocol fee treasury.',
  },
  Revenue: {
    'Taker Trading Fees To Protocol': 'Trading fees kept by the protocol treasury after paying maker rebates.',
    'Treasury Deposits': 'USDC and USDCbl deposits to the protocol fee treasury.',
  },
  ProtocolRevenue: {
    'Taker Trading Fees To Protocol': 'Trading fees kept by the protocol treasury. Decibel has no live token yet, so none is distributed to token holders.',
    'Treasury Deposits': 'USDC and USDCbl deposits to the protocol fee treasury.',
  },
  SupplySideRevenue: {
    'Maker Rebates': 'Maker rebates paid back to liquidity-providing makers out of the trading fees.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-02-10",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;

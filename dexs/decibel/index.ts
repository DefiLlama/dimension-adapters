import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { httpGet, httpPost } from "../../utils/fetchURL";

const API_URL = "https://api.mainnet.aptoslabs.com/decibel/api/v1/daily_stats";
const APTOS_GRAPHQL = "https://api.mainnet.aptoslabs.com/v1/graphql";

// matches fee_treasury::get_fee_vault_address() on the Decibel package
const FEE_TREASURY_ADDRESS =
  "0xa6ebf45cef6b683cf4275ee8c5f8f92f956a332174f8fd69143daf90115077f2";

const DECIBEL_PACKAGE =
  "0x50ead22afd6ffd9769e3b3d6e0e64a2a350d68e8b102c4e72e33d0b8cfdfdb06";

// both are 6-decimal fungible assets on Aptos
const FEE_ASSET_TYPES = new Set([
  // Native USDC on Aptos (Circle CCTP)
  "0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b",
  // USDCbl
  "0x96401f1e3ab3245d056d5a1ba67eef066ac3edc4d5f1b16adc5d567e79a845b0",
]);

const USD_DECIMALS = 1e6;

// the Aptos indexer caps a single response at 100 rows regardless of the requested limit
const PAGE_SIZE = 100;
const MAX_ROWS = 20000;

interface DailyStatsResponse {
  daily_volume: number;
  daily_fees: number;
  daily_revenue: number;
  open_interest: number;
}

const getTreasuryDepositsUsd = async (
  startTimestamp: number,
  endTimestamp: number
): Promise<number> => {
  const fromDate = new Date(startTimestamp * 1000).toISOString();
  const toDate = new Date(endTimestamp * 1000).toISOString();

  // Note: filtering by asset_type alongside owner_address triggers a slow query plan on
  // the Aptos indexer, so we fetch all deposits to the treasury in the window and filter
  // to the fee-bearing asset types client-side.
  const query = `
      query GetTreasuryDeposits($owner: String!, $fromDate: timestamp!, $toDate: timestamp!, $limit: Int!, $offset: Int!) {
        fungible_asset_activities(
          where: {
            owner_address: { _eq: $owner },
            type: { _eq: "0x1::fungible_asset::Deposit" },
            transaction_timestamp: { _gte: $fromDate, _lt: $toDate }
          }
          order_by: { transaction_version: asc }
          limit: $limit
          offset: $offset
        ) {
          amount
          asset_type
          entry_function_id_str
        }
      }
    `;

  let total = 0;
  let offset = 0;

  while (true) {
    const response = await httpPost(
      APTOS_GRAPHQL,
      {
        query,
        variables: {
          owner: FEE_TREASURY_ADDRESS,
          fromDate,
          toDate,
          limit: PAGE_SIZE,
          offset,
        },
      },
      { headers: { Authorization: `Bearer ${getEnv("DECIBEL_API_KEY")}` } }
    );
    const activities: {
      amount: string;
      asset_type: string;
      entry_function_id_str: string | null;
    }[] = response.data.fungible_asset_activities;

    for (const activity of activities) {
      // deposits made inside Decibel's own transactions are per-trade fee routing, which the
      // stats API already reports as fees; only count value arriving from outside the exchange
      const entryFunction = activity.entry_function_id_str;
      if (entryFunction !== null && entryFunction.startsWith(DECIBEL_PACKAGE)) continue;
      if (FEE_ASSET_TYPES.has(activity.asset_type)) {
        total += Number(activity.amount) / USD_DECIMALS;
      }
    }

    if (activities.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset >= MAX_ROWS)
      throw new Error(`decibel: treasury deposits exceeded ${MAX_ROWS} rows`);
  }

  return total;
};

const fetch = async (options: FetchOptions) => {
  const url = `${API_URL}?start_timestamp=${options.startTimestamp}&end_timestamp=${options.endTimestamp}`;
  const [data, treasuryDepositsUsd] = await Promise.all([
    httpGet(url, {
      headers: { Authorization: `Bearer ${getEnv("DECIBEL_API_KEY")}` },
    }) as Promise<DailyStatsResponse>,
    getTreasuryDepositsUsd(options.startTimestamp, options.endTimestamp),
  ]);

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(data.daily_fees, "Trading Fees");
  dailyFees.addUSDValue(treasuryDepositsUsd, "Fee Treasury Deposits");

  // traders pay the trading fees; they do not pay the treasury deposits
  dailyUserFees.addUSDValue(data.daily_fees, "Trading Fees");

  dailyRevenue.addUSDValue(data.daily_revenue, 'Trading Fees Kept By Decibel');
  dailyRevenue.addUSDValue(treasuryDepositsUsd, "Fee Treasury Deposits");

  dailySupplySideRevenue.addUSDValue(data.daily_fees - data.daily_revenue, 'Maker Rebates');

  return {
    dailyVolume: data.daily_volume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    openInterestAtEnd: data.open_interest,
  };
};

const methodology = {
  Volume: "Notional value of the perpetual futures trades reported by Decibel's daily stats endpoint.",
  Fees: "Trading fees charged on every fill. Takers always pay, between 0.034% and 0.018% depending on their 30-day volume, and makers pay between 0.011% and 0% until they reach the top volume tiers. Also includes USDC and USDCbl paid into Decibel's fee treasury from outside the exchange.",
  UserFees: "Trading fees paid by traders. Excludes the treasury deposits, which traders do not pay.",
  Revenue: "Everything Decibel charges, minus any maker rebates it nets out, plus the treasury deposits.",
  ProtocolRevenue: "All revenue goes to Decibel's treasury. Decibel has no live token, so nothing is distributed to token holders.",
  SupplySideRevenue: "Zero. Decibel has no maker rebate program running: its market-maker rebate tiers are empty on-chain and makers currently pay a fee rather than earn one. This turns non-zero on its own if rebates are switched on."
};

const breakdownMethodology = {
  Fees: {
    'Trading Fees': 'Fees charged on perpetual futures fills, paid by takers and by makers below the top volume tiers.',
    'Fee Treasury Deposits': 'USDC and USDCbl transferred into Decibel\'s fee treasury from outside the exchange, on top of what the trading stats report.',
  },
  UserFees: {
    'Trading Fees': 'Fees charged on perpetual futures fills, paid by takers and by makers below the top volume tiers.',
  },
  Revenue: {
    'Trading Fees Kept By Decibel': 'Trading fees left after any maker rebates are netted out.',
    'Fee Treasury Deposits': 'USDC and USDCbl transferred into Decibel\'s fee treasury from outside the exchange.',
  },
  ProtocolRevenue: {
    'Trading Fees Kept By Decibel': 'Trading fees kept by the treasury. Decibel has no live token, so none of it goes to token holders.',
    'Fee Treasury Deposits': 'USDC and USDCbl transferred into Decibel\'s fee treasury from outside the exchange.',
  },
  SupplySideRevenue: {
    'Maker Rebates': 'Rebates paid to market makers. Currently zero, as no rebate tier is configured on-chain.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: "2026-02-19",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;

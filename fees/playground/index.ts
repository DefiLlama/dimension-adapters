import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

// Playground's Aptos treasury address
const TREASURY_ADDRESS = '0x5d4a744c4895529c6d529d76b21716423493f10aa9d6b46776a94c175f55925c';

// Native USDC on Aptos mainnet (Circle CCTP)
const USDC_ASSET_TYPE = '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b';

const USDC_DECIMALS = 1e6;
const APTOS_GRAPHQL = 'https://api.mainnet.aptoslabs.com/v1/graphql';

const fetch: FetchV2 = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  try {
    // Convert timestamps to ISO format for GraphQL query
    const fromDate = new Date(options.fromTimestamp * 1000).toISOString();
    const toDate = new Date(options.toTimestamp * 1000).toISOString();

    // Query USDC deposits to treasury via Aptos indexer
    const query = {
      query: `
        query GetUSDCDeposits($owner: String!, $assetType: String!, $fromDate: timestamp!, $toDate: timestamp!) {
          fungible_asset_activities(
            where: {
              owner_address: { _eq: $owner },
              asset_type: { _eq: $assetType },
              type: { _eq: "0x1::fungible_asset::Deposit" },
              transaction_timestamp: { _gte: $fromDate, _lt: $toDate }
            }
          ) {
            amount
            transaction_timestamp
          }
        }
      `,
      variables: {
        owner: TREASURY_ADDRESS,
        assetType: USDC_ASSET_TYPE,
        fromDate,
        toDate
      }
    };

    const response = await httpPost(APTOS_GRAPHQL, query);
    const activities = response?.data?.fungible_asset_activities || [];

    let totalUsdc = 0;
    for (const activity of activities) {
      totalUsdc += Number(activity.amount) / USDC_DECIMALS;
    }

    dailyFees.addUSDValue(totalUsdc);

    console.log(`Found ${activities.length} USDC deposits to treasury, total: $${totalUsdc.toFixed(2)}`);

  } catch (error) {
    console.error('Error fetching USDC deposits:', error);
    throw error;
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Revenue from product sales on Playground. Users pay in USDC which is bridged to Aptos via Circle CCTP.",
  Revenue: "Total USDC received from product purchases, tracked via fungible asset deposits on Aptos.",
  ProtocolRevenue: "All USDC revenue collected by Playground.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2025-10-28',
    },
  },
  methodology,
};

export default adapter;

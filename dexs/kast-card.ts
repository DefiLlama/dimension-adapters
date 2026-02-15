import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const MOVEMENT_GRAPHQL = "https://indexer.mainnet.movementnetwork.xyz/v1/graphql";

// Kast's confirmed distribution wallet on Movement Network
// Distributes MOVE cashback rewards via airdrop::process_airdrop
const KAST_DISTRIBUTION_WALLET = "0x45006561c97199f8e3169048406dd56dcc4c17c08b667cdf67eb4571e7827f01";

// MOVE token has 8 decimals on Movement Network
const MOVE_DECIMALS = 1e8;

// Kast gives 4% cashback in MOVE on qualifying card spend
const CASHBACK_RATE = 0.04;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startDate = new Date(options.startTimestamp * 1000).toISOString();
  const endDate = new Date(options.endTimestamp * 1000).toISOString();

  // Query total MOVE distributed by Kast's airdrop contract in the time window
  const query = `{
    coin_activities_aggregate(
      where: {
        owner_address: {_eq: "${KAST_DISTRIBUTION_WALLET}"},
        activity_type: {_eq: "0x1::coin::WithdrawEvent"},
        entry_function_id_str: {_like: "%airdrop::process_airdrop"},
        transaction_timestamp: {_gte: "${startDate}", _lt: "${endDate}"}
      }
    ) {
      aggregate {
        count
        sum { amount }
      }
    }
  }`;

  const response = await httpPost(MOVEMENT_GRAPHQL, { query }, {
    headers: { "Content-Type": "application/json" },
  });

  const aggregate = response?.data?.coin_activities_aggregate?.aggregate;
  if (!aggregate || !aggregate.sum?.amount) {
    return { dailyVolume: 0 };
  }

  const moveDistributed = Number(aggregate.sum.amount) / MOVE_DECIMALS;

  // Card spend volume = cashback distributed / cashback rate (4%)
  // If Kast distributed 1000 MOVE in cashback, users spent 25000 MOVE worth of purchases
  const dailyVolume = options.createBalances();
  const estimatedSpendInMove = moveDistributed / CASHBACK_RATE;
  dailyVolume.addCGToken("movement", estimatedSpendInMove);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.MOVE]: {
      fetch,
      start: "2025-12-18",
    },
  },
  methodology: {
    Volume:
      "Estimated daily card spend volume, derived from on-chain MOVE cashback rewards distributed by Kast's airdrop contract on Movement Network. Kast offers 4% cashback in MOVE tokens on qualifying card purchases, so total spend is calculated as cashback distributed divided by 0.04.",
  },
};

export default adapter;

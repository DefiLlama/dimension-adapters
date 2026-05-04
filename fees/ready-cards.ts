import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const READY_CARDS_TREASURY = "bvT9KFrAqmRpnb6AsuaJzdVKEVuT5jAVYt3N5CyGvkV";

const PAYMENT_MINTS = [
  "So11111111111111111111111111111111111111112", // SOL / wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "HKJHsYJHMVK5VRyHHk5GhvzY9tBAAtPvDkZfDH6RLDTd", // READY
];

const PACK_SALES = "Pack Sales";
const PACK_SALES_TO_TREASURY = "Pack Sales To Treasury";
const MARKETPLACE_FEES = "Marketplace Fees";
const MARKETPLACE_FEES_TO_TREASURY = "Marketplace Fees To Treasury";

async function fetch(options: FetchOptions) {
  const received = options.createBalances();

  await getSolanaReceived({
    options,
    balances: received,
    target: READY_CARDS_TREASURY,
    mints: PAYMENT_MINTS,
    blacklists: [READY_CARDS_TREASURY],
  });

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  dailyFees.addBalances(received, PACK_SALES);
  dailyFees.addUSDValue(0, MARKETPLACE_FEES);
  dailyUserFees.addBalances(received, PACK_SALES);
  dailyUserFees.addUSDValue(0, MARKETPLACE_FEES);
  dailyRevenue.addBalances(received, PACK_SALES_TO_TREASURY);
  dailyRevenue.addUSDValue(0, MARKETPLACE_FEES_TO_TREASURY);
  dailyProtocolRevenue.addBalances(received, PACK_SALES_TO_TREASURY);
  dailyProtocolRevenue.addUSDValue(0, MARKETPLACE_FEES_TO_TREASURY);

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
}

const methodology = {
  Fees: "Total fees from Ready Cards pack sales and marketplace transactions. Marketplace fees are currently 0%.",
  UserFees: "User payments for Ready Cards pack sales in SOL, USDC, USDT, and READY. Ready Cards currently charges 0% marketplace fees.",
  Revenue: "Revenue from Ready Cards pack sales. Marketplace fee revenue is currently 0%.",
  ProtocolRevenue: "Revenue retained by Ready Cards from pack sales. Marketplace fee revenue is currently 0%.",
};

const breakdownMethodology = {
  Fees: {
    [PACK_SALES]: "Payments received by Ready Cards' operational hot wallet for pack purchases.",
    [MARKETPLACE_FEES]: "Ready Cards currently charges 0% marketplace fees.",
  },
  UserFees: {
    [PACK_SALES]: "Payments made by users for Ready Cards pack purchases.",
    [MARKETPLACE_FEES]: "Ready Cards currently charges 0% marketplace fees.",
  },
  Revenue: {
    [PACK_SALES_TO_TREASURY]: "Pack-sale revenue retained by Ready Cards' operational treasury wallet.",
    [MARKETPLACE_FEES_TO_TREASURY]: "Ready Cards currently charges 0% marketplace fees, so marketplace fee revenue is 0.",
  },
  ProtocolRevenue: {
    [PACK_SALES_TO_TREASURY]: "Pack-sale revenue retained by Ready Cards' operational treasury wallet.",
    [MARKETPLACE_FEES_TO_TREASURY]: "Ready Cards currently charges 0% marketplace fees, so marketplace fee revenue is 0.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-04-01",
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { getSolanaReceived } from "../helpers/token";

const READY_CARDS_TREASURY = "bvT9KFrAqmRpnb6AsuaJzdVKEVuT5jAVYt3N5CyGvkV";

const READY_MINT = "HKJHsYJHMVK5VRyHHk5GhvzY9tBAAtPvDkZfDH6RLDTd";

const PAYMENT_MINTS = [
  "So11111111111111111111111111111111111111112", // SOL / wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
];

const PACK_SALES = "Pack Sales Net Of Buybacks";
const PACK_SALES_TO_TREASURY = "Pack Sales To Treasury Net Of Buybacks";
const MARKETPLACE_FEES = "Marketplace Fees";
const MARKETPLACE_FEES_TO_TREASURY = "Marketplace Fees To Treasury";

async function getReadyBuybackSpends(options: FetchOptions) {
  const buybackSpends = options.createBalances();
  const paymentMints = PAYMENT_MINTS.map((mint) => `'${mint}'`).join(", ");

  const results = await queryAllium(`
    WITH buyback_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.assets.transfers
      WHERE to_address = '${READY_CARDS_TREASURY}'
        AND mint = '${READY_MINT}'
        AND from_address != '${READY_CARDS_TREASURY}'
        AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    )

    SELECT mint AS token, SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE from_address = '${READY_CARDS_TREASURY}'
      AND mint IN (${paymentMints})
      AND txn_id IN (SELECT txn_id FROM buyback_txs)
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint
  `);

  results.forEach((row: { token: string; amount: string }) => {
    buybackSpends.add(row.token, row.amount);
  });

  return buybackSpends;
}

async function fetch(options: FetchOptions) {
  const received = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  try {
    await getSolanaReceived({
      options,
      balances: received,
      target: READY_CARDS_TREASURY,
      mints: PAYMENT_MINTS,
      blacklists: [READY_CARDS_TREASURY],
    });

    const buybackSpends = await getReadyBuybackSpends(options);
    received.subtract(buybackSpends);
  } catch (e) {
    console.error(
      `[ready-cards] failed to fetch Solana net receipts for treasury ${READY_CARDS_TREASURY}`,
      e,
    );
  }

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
  Fees: "Net fees from Ready Cards pack sales after subtracting SOL, USDC, and USDT spent on READY buybacks. Marketplace fees are currently 0%.",
  UserFees: "User payments for Ready Cards pack sales in SOL, USDC, and USDT, net of READY buyback spends. Ready Cards currently charges 0% marketplace fees.",
  Revenue: "Net revenue from Ready Cards pack sales after subtracting SOL, USDC, and USDT spent on READY buybacks. Marketplace fee revenue is currently 0%.",
  ProtocolRevenue: "Net revenue retained by Ready Cards after subtracting SOL, USDC, and USDT spent on READY buybacks. Marketplace fee revenue is currently 0%.",
};

const breakdownMethodology = {
  Fees: {
    [PACK_SALES]: "Payments received by Ready Cards' operational hot wallet for pack purchases, minus SOL, USDC, and USDT spent from that wallet in transactions where the wallet receives READY as buybacks.",
    [MARKETPLACE_FEES]: "Ready Cards currently charges 0% marketplace fees.",
  },
  UserFees: {
    [PACK_SALES]: "Payments made by users for Ready Cards pack purchases, net of READY buyback spends.",
    [MARKETPLACE_FEES]: "Ready Cards currently charges 0% marketplace fees.",
  },
  Revenue: {
    [PACK_SALES_TO_TREASURY]: "Pack-sale revenue retained by Ready Cards' operational treasury wallet, net of READY buyback spends.",
    [MARKETPLACE_FEES_TO_TREASURY]: "Ready Cards currently charges 0% marketplace fees, so marketplace fee revenue is 0.",
  },
  ProtocolRevenue: {
    [PACK_SALES_TO_TREASURY]: "Pack-sale revenue retained by Ready Cards' operational treasury wallet, net of READY buyback spends.",
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
  allowNegativeValue: true,
  methodology,
  breakdownMethodology,
};

export default adapter;

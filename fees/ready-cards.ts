import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { METRIC } from "../helpers/metrics";
import { getSolanaReceived } from "../helpers/token";

const READY_CARDS_TREASURY = "bvT9KFrAqmRpnb6AsuaJzdVKEVuT5jAVYt3N5CyGvkV";

const READY_MINT = "HKJHsYJHMVK5VRyHHk5GhvzY9tBAAtPvDkZfDH6RLDTd";

const PAYMENT_MINTS = [
  "So11111111111111111111111111111111111111112", // SOL / wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
];

const PACK_SALES = "Pack Sales And Marketplace Fees";
const CARD_SELLBACKS = "Card Sellbacks";
const READY_BUYBACKS = METRIC.TOKEN_BUY_BACK;

const paymentMints = PAYMENT_MINTS.map((mint) => `'${mint}'`).join(", ");

const tokenBuybackTxs = (options: FetchOptions) => `
  SELECT DISTINCT ready_in.txn_id
  FROM solana.assets.transfers ready_in
  JOIN solana.assets.transfers payment_out
    ON ready_in.txn_id = payment_out.txn_id
  WHERE ready_in.to_address = '${READY_CARDS_TREASURY}'
    AND ready_in.mint = '${READY_MINT}'
    AND ready_in.from_address != '${READY_CARDS_TREASURY}'
    AND payment_out.from_address = '${READY_CARDS_TREASURY}'
    AND payment_out.mint IN (${paymentMints})
    AND ready_in.block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    AND payment_out.block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
`;

async function getReadyTokenBuybackSpends(options: FetchOptions) {
  const buybackSpends = options.createBalances();

  const results = await queryAllium(`
    WITH token_buyback_txs AS (${tokenBuybackTxs(options)})

    SELECT mint AS token, SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE from_address = '${READY_CARDS_TREASURY}'
      AND mint IN (${paymentMints})
      AND txn_id IN (SELECT txn_id FROM token_buyback_txs)
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint
  `);

  results.forEach((row: { token: string; amount: string }) => {
    buybackSpends.add(row.token, row.amount);
  });

  return buybackSpends;
}

async function getCardSellbackSpends(options: FetchOptions) {
  const sellbackSpends = options.createBalances();

  const results = await queryAllium(`
    WITH token_buyback_txs AS (${tokenBuybackTxs(options)})

    SELECT mint AS token, SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE from_address = '${READY_CARDS_TREASURY}'
      AND mint IN (${paymentMints})
      AND txn_id NOT IN (SELECT txn_id FROM token_buyback_txs)
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint
  `);

  results.forEach((row: { token: string; amount: string }) => {
    sellbackSpends.add(row.token, row.amount);
  });

  return sellbackSpends;
}

async function getReadyFees(options: FetchOptions) {
  const readyFees = options.createBalances();

  const results = await queryAllium(`
    WITH token_buyback_txs AS (${tokenBuybackTxs(options)})

    SELECT SUM(raw_amount) AS amount
    FROM solana.assets.transfers
    WHERE to_address = '${READY_CARDS_TREASURY}'
      AND mint = '${READY_MINT}'
      AND from_address != '${READY_CARDS_TREASURY}'
      AND txn_id NOT IN (SELECT txn_id FROM token_buyback_txs)
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  readyFees.add(READY_MINT, results[0]?.amount ?? 0);

  return readyFees;
}

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  try {
    const grossFees = options.createBalances();

    await getSolanaReceived({
      options,
      balances: grossFees,
      target: READY_CARDS_TREASURY,
      mints: PAYMENT_MINTS,
      blacklists: [READY_CARDS_TREASURY],
    });

    const readyFees = await getReadyFees(options);
    const cardSellbackSpends = await getCardSellbackSpends(options);
    const readyTokenBuybackSpends = await getReadyTokenBuybackSpends(options);

    grossFees.addBalances(readyFees);
    dailyFees.addBalances(grossFees, PACK_SALES);
    dailyUserFees.addBalances(grossFees, PACK_SALES);

    dailySupplySideRevenue.addBalances(cardSellbackSpends, CARD_SELLBACKS);
    dailyHoldersRevenue.addBalances(readyTokenBuybackSpends, READY_BUYBACKS);

    dailyRevenue.addBalances(grossFees, PACK_SALES);
    dailyRevenue.subtract(dailySupplySideRevenue);

    dailyProtocolRevenue.addBalances(dailyRevenue);
    dailyProtocolRevenue.subtract(dailyHoldersRevenue);
  } catch (e) {
    console.error(
      `[ready-cards] failed to fetch Solana fee data for treasury ${READY_CARDS_TREASURY}`,
      e,
    );
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

const methodology = {
  Fees: "Gross user payments received by Ready Cards' treasury for pack sales and marketplace fees in SOL, USDC, USDT, and READY.",
  UserFees: "Gross user payments for Ready Cards pack sales and marketplace trades in SOL, USDC, USDT, and READY.",
  Revenue: "Ready Cards revenue after subtracting card sellback payouts made from the treasury to users.",
  ProtocolRevenue: "Revenue retained by Ready Cards after card sellback payouts and READY token buybacks.",
  SupplySideRevenue: "Card sellback payouts from Ready Cards' treasury to users, such as when users sell opened cards back to Ready Cards.",
  HoldersRevenue: "SOL, USDC, and USDT spent by Ready Cards' treasury to buy back READY tokens.",
};

const breakdownMethodology = {
  Fees: {
    [PACK_SALES]: "Gross payments received by Ready Cards' operational treasury wallet for pack purchases and marketplace fees. READY receipts are included only when they are not part of READY token buyback transactions.",
  },
  UserFees: {
    [PACK_SALES]: "Gross payments made by users for Ready Cards pack purchases and marketplace trades.",
  },
  Revenue: {
    [PACK_SALES]: "Gross pack-sale and marketplace-fee revenue minus card sellback payouts to users.",
  },
  ProtocolRevenue: {
    [PACK_SALES]: "Revenue retained by Ready Cards after card sellback payouts and READY token buybacks.",
  },
  SupplySideRevenue: {
    [CARD_SELLBACKS]: "Payments from Ready Cards' treasury to users for card sellbacks. Example transaction: 6CEvuPmZjcjP5L6d5CJqVsXzKfRqz8Q9mpERfdpcEUCZgCokf6y3eZQyBaRB77MKgDAXErHciEL5xUdQwUFPYGG.",
  },
  HoldersRevenue: {
    [READY_BUYBACKS]: "SOL, USDC, and USDT spent from Ready Cards' treasury in transactions where that wallet receives READY as a token buyback.",
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

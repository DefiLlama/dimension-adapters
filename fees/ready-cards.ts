import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const READY_CARDS_TREASURY = "bvT9KFrAqmRpnb6AsuaJzdVKEVuT5jAVYt3N5CyGvkV";
const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const PAYMENT_MINTS = [
  "So11111111111111111111111111111111111111112", // SOL / wSOL
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
  "HKJHsYJHMVK5VRyHHk5GhvzY9tBAAtPvDkZfDH6RLDTd", // READY
];

const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const PACK_RIPS = "Pack Rips";
const CARD_BUYBACKS = "Card Buybacks";

const paymentMints = PAYMENT_MINTS.map((mint) => `'${mint}'`).join(", ");

async function getAlliumData(options: FetchOptions) {
  const tokenPackRips = options.createBalances();
  const web2PackRips = options.createBalances();
  const cardBuybacks = options.createBalances();

  const results = await queryAllium(`
    WITH web2_memos AS (
      SELECT
        txn_id,
        COALESCE(
          TRY_PARSE_JSON(parsed):info:memo::STRING,
          TRY_PARSE_JSON(parsed):memo::STRING,
          parsed
        ) AS memo_text
      FROM solana.raw.instructions
      WHERE program_id = '${MEMO_PROGRAM}'
        AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    )

    SELECT 'token_pack_rips' AS category, mint AS token, COALESCE(SUM(raw_amount), 0) AS amount
    FROM solana.assets.transfers
    WHERE to_address = '${READY_CARDS_TREASURY}'
      AND mint IN (${paymentMints})
      AND from_address != '${READY_CARDS_TREASURY}'
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint

    UNION ALL

    SELECT 'card_buybacks' AS category, '${USDT_MINT}' AS token, COALESCE(SUM(raw_amount), 0) AS amount
    FROM solana.assets.transfers
    WHERE from_address = '${READY_CARDS_TREASURY}'
      AND mint = '${USDT_MINT}'
      AND to_address != '${READY_CARDS_TREASURY}'
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})

    UNION ALL

    SELECT 'web2_pack_rips' AS category, 'USD' AS token, COALESCE(SUM(
      TRY_TO_DOUBLE(REGEXP_SUBSTR(memo_text, '(totalUsd|totalUSD|usd|USD)=([0-9]+(\\.[0-9]+)?)', 1, 1, 'e', 2))
    ), 0) AS amount
    FROM web2_memos
    WHERE memo_text ILIKE 'READY|WEB2|%'
  `);

  results.forEach((row: { category: string; token: string; amount: string }) => {
    if (row.category === "token_pack_rips") {
      tokenPackRips.add(row.token, row.amount);
    } else if (row.category === "web2_pack_rips") {
      web2PackRips.addUSDValue(Number(row.amount), PACK_RIPS);
    } else if (row.category === "card_buybacks") {
      cardBuybacks.add(row.token, row.amount);
    }
  });

  return { tokenPackRips, web2PackRips, cardBuybacks };
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  const grossPackRips = options.createBalances();
  const costOfRevenue = options.createBalances();

  const { tokenPackRips, web2PackRips, cardBuybacks } = await getAlliumData(options);

  grossPackRips.add(tokenPackRips, PACK_RIPS);
  grossPackRips.add(web2PackRips, PACK_RIPS);
  costOfRevenue.add(cardBuybacks, CARD_BUYBACKS);
  dailyVolume.add(grossPackRips);

  const dailyFees = grossPackRips.clone();
  const dailyUserFees = grossPackRips.clone();
  const dailyRevenue = grossPackRips.clone();
  const dailyProtocolRevenue = grossPackRips.clone();

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue: costOfRevenue,
    dailyHoldersRevenue: "0",
  };
}

const methodology = {
  Volume: "Gross Ready Cards pack-rip value.",
  Fees: "Gross value spent on Ready Cards pack rips, including token-paid pack rips and web2/spin-credit pack rips recorded through READY|WEB2 on-chain memos. Buybacks are not netted into fees.",
  UserFees: "Gross value paid or spent by users for Ready Cards pack rips.",
  Revenue: "Gross pack-rip value before card buybacks/sellbacks.",
  ProtocolRevenue: "Gross pack-rip value allocated to the Ready Cards protocol before card buybacks/sellbacks.",
  SupplySideRevenue: "Card buybacks/sellbacks paid out by the protocol, tracked as outbound USDT from the dedicated Ready Cards treasury.",
  HoldersRevenue: "No token holder revenue is counted for the current Ready Cards model.",
};

const breakdownMethodology = {
  Fees: {
    [PACK_RIPS]: "Gross Ready Cards pack-rip value, including incoming SOL, USDC, USDT, READY, and web2/spin-credit rips recorded through READY|WEB2 on-chain memos.",
  },
  Revenue: {
    [PACK_RIPS]: "Gross Ready Cards pack-rip value before card buybacks/sellbacks.",
  },
  ProtocolRevenue: {
    [PACK_RIPS]: "Gross Ready Cards pack-rip value before card buybacks/sellbacks.",
  },
  SupplySideRevenue: {
    [CARD_BUYBACKS]: "Outbound USDT from the dedicated Ready Cards treasury. Operating expenses and other company payments are handled outside this wallet.",
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

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";
import { METRIC } from "../helpers/metrics";

const READY_CARDS_TREASURY = "bvT9KFrAqmRpnb6AsuaJzdVKEVuT5jAVYt3N5CyGvkV";

const READY_MINT = "HKJHsYJHMVK5VRyHHk5GhvzY9tBAAtPvDkZfDH6RLDTd";

const PAYMENT_MINTS = [
    "So11111111111111111111111111111111111111112", // SOL / wSOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", // USDT
];

const paymentMints = PAYMENT_MINTS.map((mint) => `'${mint}'`).join(", ");

async function getAlliumData(options: FetchOptions) {
    const packPurchases = options.createBalances();
    const marketplaceFees = options.createBalances();
    const cardBuybacks = options.createBalances();
    const tokenBuybackSpends = options.createBalances();

    const results = await queryAllium(`
    WITH token_buyback_txs AS (
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
    )

    SELECT 'pack_purchases' AS category, mint AS token, COALESCE(SUM(raw_amount), 0) AS amount
    FROM solana.assets.transfers
    WHERE to_address = '${READY_CARDS_TREASURY}'
      AND mint IN (${paymentMints})
      AND from_address != '${READY_CARDS_TREASURY}'
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint

    UNION ALL

    SELECT 'card_buybacks' AS category, mint AS token, COALESCE(SUM(raw_amount), 0) AS amount
    FROM solana.assets.transfers
    WHERE from_address = '${READY_CARDS_TREASURY}'
      AND mint IN (${paymentMints})
      AND txn_id NOT IN (SELECT txn_id FROM token_buyback_txs)
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint

    UNION ALL

    SELECT 'marketplace_fees' AS category, '${READY_MINT}' AS token, COALESCE(SUM(raw_amount), 0) AS amount
    FROM solana.assets.transfers
    WHERE to_address = '${READY_CARDS_TREASURY}'
      AND mint = '${READY_MINT}'
      AND from_address != '${READY_CARDS_TREASURY}'
      AND txn_id NOT IN (SELECT txn_id FROM token_buyback_txs)
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})

    UNION ALL

    SELECT 'token_buyback_spends' AS category, mint AS token, COALESCE(SUM(raw_amount), 0) AS amount
    FROM solana.assets.transfers
    WHERE from_address = '${READY_CARDS_TREASURY}'
      AND mint IN (${paymentMints})
      AND txn_id IN (SELECT txn_id FROM token_buyback_txs)
      AND block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND TO_TIMESTAMP_NTZ(${options.endTimestamp})
    GROUP BY mint
  `);

    results.forEach((row: { category: string; token: string; amount: string }) => {
        if (row.category === "pack_purchases") {
            packPurchases.add(row.token, row.amount);
        } else if (row.category === "card_buybacks") {
            cardBuybacks.add(row.token, row.amount);
        } else if (row.category === "marketplace_fees") {
            marketplaceFees.add(row.token, row.amount);
        } else if (row.category === "token_buyback_spends") {
            tokenBuybackSpends.add(row.token, row.amount);
        }
    });

    return { packPurchases, marketplaceFees, cardBuybacks, tokenBuybackSpends };
}

async function fetch(options: FetchOptions) {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const { packPurchases, marketplaceFees, cardBuybacks, tokenBuybackSpends } = await getAlliumData(options);

    dailyVolume.add(packPurchases)

    dailyFees.add(packPurchases, "Pack Purchases");
    dailyFees.add(marketplaceFees, "Marketplace Fees");
    dailyFees.subtract(cardBuybacks, "Card Buybacks");

    const dailyRevenue = dailyFees.clone();
    const dailyProtocolRevenue = dailyFees.clone();

    dailyHoldersRevenue.add(tokenBuybackSpends, METRIC.TOKEN_BUY_BACK);

    dailyProtocolRevenue.subtract(tokenBuybackSpends, "Token Buyback Spends");

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
    };
}

const methodology = {
    Volume: "Total spends on card pack sales",
    Fees: "Fees collected from card pack sales and marketplace trades after subtracting card buybacks",
    Revenue: "Revenue from card pack sales and marketplace trades after subtracting card buybacks",
    ProtocolRevenue: "Revenue retained by protocol after card buybacks and $READY token buybacks",
    HoldersRevenue: "Part of revenue spent on $READY token buybacks",
};

const breakdownMethodology = {
    Fees: {
        "Pack Purchases": "Fees collected from card pack sales",
        "Marketplace Fees": "Fees collected from marketplace trades",
        "Card Buybacks": "Fees spent on card buybacks",
    },
    Revenue: {
        "Pack Purchases": "Fees collected from card pack sales",
        "Marketplace Fees": "Fees collected from marketplace trades",
        "Card Buybacks": "Fees spent on card buybacks",
    },
    ProtocolRevenue: {
        "Pack Purchases": "Fees collected from card pack sales",
        "Marketplace Fees": "Fees collected from marketplace trades",
        "Card Buybacks": "Fees spent on card buybacks",
        "Token Buyback Spends": "Fees spent on $READY token buybacks",
    },
    HoldersRevenue: {
        [METRIC.TOKEN_BUY_BACK]: "Part of revenue going to token buybacks",
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

import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// ─── Contract addresses ────────────────────────────────────────────────────
// v1 — old payment_vault contract (historical, Feb 2026 – ~Mar 2026)
const VAULT_ADDRESS_V1 =
    "0x982577d229191b0227cf90574c2be5bf842a73f4728f7386f7402420123fb4a6";

// v2 — creator_payout module (CompanionzAI payout contract, deployed Mar 2026)
const PAYOUT_CONTRACT_ADDRESS = "0xfdeec7040478f26c48ed0b58b45153f593d8df7f45eea0b6f7c1f9b6df000967";

const V1_LAST_TXN_DATE = "2026-03-01"
const V2_DEPLOYED_DATE = "2026-03-15"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    // ── v1: DepositEvent from old payment_vault ────────────────────────────
    // Covers all historical revenue up until v1 contract was superseded.
    const queryV1 = `
    SELECT
      COALESCE(SUM(CAST(JSON_EXTRACT_SCALAR(data, '$.amount') AS DOUBLE)) / 1e6, 0) AS revenue
    FROM aptos.events
    WHERE event_type = '${VAULT_ADDRESS_V1}::payment_vault::DepositEvent'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  `;

    // ── v2: PayoutBatchCompleted from creator_payout module ───────────────
    // Each on-chain payout settlement emits one PayoutBatchCompleted event
    // with total_usdt_micro = total USDT (6 decimals) sent to creators that day.
    // This represents the protocol's daily creator revenue settled on-chain.
    //
    // NOTE: The v2 adapter also tracks individual payment inscriptions via
    // PayoutInscription events, but summing PayoutBatchCompleted is sufficient
    // and cheaper for DeFiLlama indexing (one event per daily batch).
    const queryV2 = `
    SELECT
      COALESCE(SUM(CAST(JSON_EXTRACT_SCALAR(data, '$.total_usdt_micro') AS DOUBLE)) / 1e6, 0) AS revenue
    FROM aptos.events
    WHERE event_type = '${PAYOUT_CONTRACT_ADDRESS}::creator_payout::PayoutBatchCompleted'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
  `;

    if (options.dateString > V1_LAST_TXN_DATE && options.dateString < V2_DEPLOYED_DATE) {
        return {
            dailyFees: 0,
            dailyRevenue: 0,
            dailyProtocolRevenue: 0,
        };
    }

    const duneQuery = options.dateString >= V2_DEPLOYED_DATE ? queryV2 : queryV1;

    const results = await queryDuneSql(options, duneQuery);
    const revenue = results[0].revenue;

    return {
        dailyFees: revenue,
        dailyRevenue: revenue,
        dailyProtocolRevenue: revenue,
    };
};

const methodology = {
    Fees: "All USDT payments from users subscribing to AI character content on CompanionzAI",
    Revenue: "100% of user payments are protocol revenue, distributed daily to character creators",
    ProtocolRevenue: "Daily USDT settled on-chain to creator wallets via the payout contract",
};

const adapter: Adapter = {
    version: 1,
    dependencies: [Dependencies.DUNE],
    fetch,
    chains: [CHAIN.APTOS],
    start: "2026-02-15",
    methodology,
    isExpensiveAdapter: true,
};

export default adapter;

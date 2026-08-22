import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// send.fun DEX: the constant-product, permanent-liquidity AMM that tokens
// migrate into after the bonding curve. This is the "Dexs" child of the
// "send.fun" parent on DefiLlama; the launchpad is a sibling adapter
// (fees/send-fun). Every fee is denominated in the pool's quote mint (WSOL,
// USDC, ...) and is sourced from Dune-decoded Anchor `emit_cpi!` events on the
// DEX program 84qj5FPZZdXkQy8mfowyg6RBZ3XKuTds6XS4ZYT1sfDX:
//   TradeEvent       -> protocol_fee, creator_fee, lp_fee
//   TokenCreateEvent -> creation_fee  (direct DEX pool creation, if any)
//
// Fee routing:
//   protocol_fee + creation_fee -> SEND stakers (holders)      [Revenue + HoldersRevenue]
//   creator_fee                 -> coin creator                [SupplySideRevenue]
//   lp_fee                      -> DEX pool reserves / LPs      [SupplySideRevenue]
const SCHEMA = "sendfun_dex_solana";
const TABLES = {
  trade: `${SCHEMA}.send_dex_evt_tradeevent`,
  create: `${SCHEMA}.send_dex_evt_tokencreateevent`,
};

// SOL-quoted pools settle in wrapped SOL; guard against a decoder emitting the
// System Program id / null and normalize to WSOL so DefiLlama can price it.
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
function normalizeQuoteMint(mint: string | null | undefined): string {
  if (!mint || mint === SYSTEM_PROGRAM) return ADDRESSES.solana.SOL;
  return mint;
}

const fetch = async (options: FetchOptions) => {
  const timeFilter = `evt_block_time >= from_unixtime(${options.startTimestamp})
      AND evt_block_time < from_unixtime(${options.endTimestamp})`;

  const sql = `
    WITH trades AS (
      SELECT
        quote_mint AS token,
        COALESCE(SUM(CAST(protocol_fee AS decimal(38, 0))), 0) AS protocol_fee,
        COALESCE(SUM(CAST(creator_fee AS decimal(38, 0))), 0) AS creator_fee,
        COALESCE(SUM(CAST(lp_fee AS decimal(38, 0))), 0) AS lp_fee,
        CAST(0 AS decimal(38, 0)) AS creation_fee
      FROM ${TABLES.trade}
      WHERE ${timeFilter}
      GROUP BY quote_mint
    ),
    creates AS (
      SELECT
        quote_mint AS token,
        CAST(0 AS decimal(38, 0)) AS protocol_fee,
        CAST(0 AS decimal(38, 0)) AS creator_fee,
        CAST(0 AS decimal(38, 0)) AS lp_fee,
        COALESCE(SUM(CAST(creation_fee AS decimal(38, 0))), 0) AS creation_fee
      FROM ${TABLES.create}
      WHERE ${timeFilter}
      GROUP BY quote_mint
    ),
    combined AS (
      SELECT * FROM trades
      UNION ALL SELECT * FROM creates
    )
    SELECT
      token,
      COALESCE(SUM(protocol_fee), 0) AS protocol_fee,
      COALESCE(SUM(creator_fee), 0) AS creator_fee,
      COALESCE(SUM(lp_fee), 0) AS lp_fee,
      COALESCE(SUM(creation_fee), 0) AS creation_fee
    FROM combined
    GROUP BY token
  `;

  const rows = await queryDuneSql(options, sql);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const row of rows ?? []) {
    const token = normalizeQuoteMint(row.token);
    const protocolFee = row.protocol_fee;
    const creatorFee = row.creator_fee;
    const lpFee = row.lp_fee;
    const creationFee = row.creation_fee;

    // Fees: everything the user paid, labelled by source.
    dailyFees.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyFees.add(token, creatorFee, METRIC.CREATOR_FEES);
    dailyFees.add(token, lpFee, METRIC.LP_FEES);
    dailyFees.add(token, creationFee, "Pool Creation Fee");

    // Revenue: protocol trade-fee slice + creation fees.
    dailyRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyRevenue.add(token, creationFee, "Pool Creation Fee");

    // Holders: 100% of protocol revenue is distributed to SEND stakers.
    dailyHoldersRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.add(token, creationFee, "Pool Creation Fee");

    // Supply side: coin creators (creator_fee) and DEX LPs (lp_fee).
    dailySupplySideRevenue.add(token, creatorFee, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.add(token, lpFee, METRIC.LP_FEES);
  }

  // dailyProtocolRevenue is intentionally empty (0): send.fun keeps no treasury
  // cut; all protocol revenue is routed to SEND stakers (dailyHoldersRevenue).
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Free on send.fun and partners, 0.05% on non-partner swaps.",
  Revenue: "Protocol fees minus creator fees.",
  ProtocolRevenue: "None. All of send.fun's revenue goes to SEND stakers.",
  HoldersRevenue: "All of send.fun's revenue is paid out to people who stake SEND.",
  SupplySideRevenue:
    "Creator fees paid to token creators, plus LP fees kept in the pool for liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "0.05% fee on non-partner swaps (free on send.fun and partners).",
    [METRIC.CREATOR_FEES]: "0.1% creator fee on all swaps.",
    [METRIC.LP_FEES]: "No LP fee on the DEX.",
    "Pool Creation Fee": "No pool-creation fees on the DEX.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fees (paid to SEND stakers).",
    "Pool Creation Fee": "Pool-creation fees (paid to SEND stakers).",
  },
  HoldersRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fees paid to SEND stakers.",
    "Pool Creation Fee": "Pool-creation fees paid to SEND stakers.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "Creator fees paid out to token creators.",
    [METRIC.LP_FEES]: "Swap fees kept in the pool for liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-06-11",
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;

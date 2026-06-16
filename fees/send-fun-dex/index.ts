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
        SUM(CAST(protocol_fee AS decimal(38, 0))) AS protocol_fee,
        SUM(CAST(creator_fee AS decimal(38, 0))) AS creator_fee,
        SUM(CAST(lp_fee AS decimal(38, 0))) AS lp_fee,
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
        SUM(CAST(creation_fee AS decimal(38, 0))) AS creation_fee
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
      SUM(protocol_fee) AS protocol_fee,
      SUM(creator_fee) AS creator_fee,
      SUM(lp_fee) AS lp_fee,
      SUM(creation_fee) AS creation_fee
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
    const protocolFee = row.protocol_fee ?? 0;
    const creatorFee = row.creator_fee ?? 0;
    const lpFee = row.lp_fee ?? 0;
    const creationFee = row.creation_fee ?? 0;

    // Fees: everything the user paid, labelled by source.
    dailyFees.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyFees.add(token, creatorFee, METRIC.CREATOR_FEES);
    dailyFees.add(token, lpFee, METRIC.LP_FEES);
    dailyFees.add(token, creationFee, METRIC.SERVICE_FEES);

    // Revenue: protocol trade-fee slice + creation fees.
    dailyRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyRevenue.add(token, creationFee, METRIC.SERVICE_FEES);

    // Holders: 100% of protocol revenue is distributed to SEND stakers.
    dailyHoldersRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.add(token, creationFee, METRIC.SERVICE_FEES);

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
  Fees: "Protocol, creator, and LP fees charged on every DEX trade, plus any direct pool creation fees.",
  Revenue:
    "Protocol trade-fee slice plus creation fees (equals Fees minus creator and LP fees).",
  ProtocolRevenue:
    "Zero - send.fun keeps no treasury cut; 100% of protocol revenue is distributed to SEND stakers (see HoldersRevenue).",
  HoldersRevenue:
    "Protocol trade-fee slice and creation fees, routed 100% to SEND stakers.",
  SupplySideRevenue:
    "Trade fees paid to coin creators plus LP fees retained in DEX pool reserves for liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Protocol slice of every DEX trade fee.",
    [METRIC.CREATOR_FEES]: "Creator slice of every DEX trade fee.",
    [METRIC.LP_FEES]: "DEX trade fee retained in pool reserves for liquidity providers.",
    [METRIC.SERVICE_FEES]: "Pool creation fee charged on direct DEX pool creation.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol slice of trade fees (routed to SEND stakers).",
    [METRIC.SERVICE_FEES]: "Pool creation fees (routed to SEND stakers).",
  },
  HoldersRevenue: {
    [METRIC.PROTOCOL_FEES]:
      "Protocol slice of trade fees distributed to SEND stakers.",
    [METRIC.SERVICE_FEES]: "Pool creation fees distributed to SEND stakers.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "DEX trade fees paid out to coin creators.",
    [METRIC.LP_FEES]: "DEX trade fees retained in pool reserves for LPs.",
  },
};

const adapter: SimpleAdapter = {
  // Dune-backed adapter: queries refresh once per day, so use version 1
  // (a version 2 adapter would re-run the same expensive query hourly).
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

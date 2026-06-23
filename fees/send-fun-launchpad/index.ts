import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

// send.fun launchpad (bonding-curve) fees. This is the "Launchpad" child of the
// "send.fun" parent on DefiLlama; the permanent-liquidity DEX is a sibling
// adapter (fees/send-fun-dex). Every fee is denominated in the curve's quote
// mint (WSOL, USDC, ...) and is sourced from Dune-decoded Anchor `emit_cpi!`
// events on the launchpad program 5R1uFyEE4oxqkm7hJDqHq6gXaLVF9dxeF3LF4yz1sfLP:
//   TradeEvent       -> protocol_fee, creator_fee  (no LP fee on the curve)
//   TokenCreateEvent -> creation_fee
//
// Fee routing:
//   protocol_fee + creation_fee -> SEND stakers (holders)   [Revenue + HoldersRevenue]
//   creator_fee                 -> coin creator             [SupplySideRevenue]
//   migration (curve -> DEX pool)-> no fee
const SCHEMA = "sendfun_launchpad_solana";
const TABLES = {
  trade: `${SCHEMA}.send_launchpad_evt_tradeevent`,
  create: `${SCHEMA}.send_launchpad_evt_tokencreateevent`,
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
    const creationFee = row.creation_fee;

    // Fees: everything the user paid, labelled by source.
    dailyFees.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyFees.add(token, creatorFee, METRIC.CREATOR_FEES);
    dailyFees.add(token, creationFee, "Token Creation Fee");

    // Revenue: protocol trade-fee slice + creation fees.
    dailyRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyRevenue.add(token, creationFee, "Token Creation Fee");

    // Holders: 100% of protocol revenue is distributed to SEND stakers.
    dailyHoldersRevenue.add(token, protocolFee, METRIC.PROTOCOL_FEES);
    dailyHoldersRevenue.add(token, creationFee, "Token Creation Fee");

    // Supply side: coin creators.
    dailySupplySideRevenue.add(token, creatorFee, METRIC.CREATOR_FEES);
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
  Fees: "Protocol and creator fees charged on every bonding-curve trade, plus token creation fees.",
  Revenue:
    "Protocol trade-fee slice plus token creation fees (equals Fees minus creator fees).",
  ProtocolRevenue:
    "Zero - send.fun keeps no treasury cut; 100% of protocol revenue is distributed to SEND stakers (see HoldersRevenue).",
  HoldersRevenue:
    "Protocol trade-fee slice and token creation fees, routed 100% to SEND stakers.",
  SupplySideRevenue: "Bonding-curve trade fees paid to coin creators.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: "Protocol slice of every bonding-curve trade fee.",
    [METRIC.CREATOR_FEES]: "Creator slice of every bonding-curve trade fee.",
    "Token Creation Fee": "Token launch fee charged at token creation.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol slice of trade fees (routed to SEND stakers).",
    "Token Creation Fee": "Token creation fees (routed to SEND stakers).",
  },
  HoldersRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol slice of trade fees distributed to SEND stakers.",
    "Token Creation Fee": "Token creation fees distributed to SEND stakers.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "Bonding-curve trade fees paid out to coin creators.",
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

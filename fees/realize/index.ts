import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { assertComplete, programEventsSql, u64, u8 } from "../../helpers/alliumSolanaEvents";
import { base58Decode } from "../../helpers/solana";

// realize: Partner launches on Pump.fun backed by the realize Launch Reserve. Every lamport of protocol revenue goes
// through the program's Revenue Router (`pay_revenue_v4` / `route_revenue_v4`), which splits it on-chain and emits one
// `RevenueRecorded` event per payment with the exact amount of each leg.
// Program: https://solscan.io/account/5BEMuVyRY43q8ZnsTVJHqj6fGjXrGew4HCXbNwWXCoKJ
const PROGRAM = "5BEMuVyRY43q8ZnsTVJHqj6fGjXrGew4HCXbNwWXCoKJ";
// Anyone can open a Pool and a Router under their own authority; only realize's authority (the protocol operator) is
// counted. https://solscan.io/account/Eqsq1vJRSuRUAp1siGM53Fq5ssaZ4Fteq5kuC1pKGtgN
const AUTHORITY = "Eqsq1vJRSuRUAp1siGM53Fq5ssaZ4Fteq5kuC1pKGtgN";
const AUTHORITY_HEX = Buffer.from(base58Decode(AUTHORITY)).toString("hex");

// Anchor event discriminator of RevenueRecorded (sha256("event:RevenueRecorded")[0..8]), from the program's IDL.
const REVENUE_RECORDED = "bc2bc242a0b9f4f0";
// RevenueRecorded, byte offsets with the discriminator: authority 8, pool 40, payer 72, routing_version 104, kind 105,
// lamports 106, recipients [4] 114, bps [4] 242, legs [5] 250 (buyback, operations, builder rewards, Reserve, POL),
// to_suppliers 290, to_house 298, share_price_e9 306. 322 bytes in all.
const REVENUE_RECORDED_LENGTH = 322;

// `kind` of a payment (lib.rs RevenueKind)
const KINDS: Record<number, string> = {
  0: "Launch Creation Fees",
  1: "Success Share",
  2: "Creator Fee Share",
  3: "Founder Purchase Fees",
  4: "Other Protocol Fees",
  5: "Launch Returns Above Principal",
  6: "Launch Extension Fees",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const rows = await queryAllium(`
    ${programEventsSql(PROGRAM, options)},
    revenue AS (
      SELECT data FROM program_events
      WHERE LEFT(data, 16) = '${REVENUE_RECORDED}' AND LENGTH(data) / 2 = ${REVENUE_RECORDED_LENGTH}
        AND LOWER(SUBSTR(data, 17, 64)) = '${AUTHORITY_HEX}'
    ),
    unknown AS (
      SELECT COUNT(*) AS n FROM program_events
      WHERE LEFT(data, 16) = '${REVENUE_RECORDED}' AND LENGTH(data) / 2 <> ${REVENUE_RECORDED_LENGTH}
    )
    SELECT 'check' AS row_kind, c.cut_txs, c.cut_tx, c.indexed, (SELECT n FROM unknown) AS unknown_layout,
      NULL AS kind, NULL AS lamports, NULL AS buyback, NULL AS operations, NULL AS builders, NULL AS suppliers, NULL AS house
    FROM checks c
    UNION ALL
    SELECT 'revenue', NULL, NULL, NULL, NULL, TO_NUMBER(${u8("data", 105)}, 'XX'),
      SUM(${u64("data", 106)}), SUM(${u64("data", 250)}), SUM(${u64("data", 258)}), SUM(${u64("data", 266)}),
      SUM(${u64("data", 290)}), SUM(${u64("data", 298)})
    FROM revenue
    GROUP BY 6
  `);

  const check = rows.find((row: any) => String(row.row_kind).toLowerCase() === "check");
  assertComplete(check, "realize", options);
  if (Number(check.unknown_layout) > 0) throw new Error(`realize: ${check.unknown_layout} RevenueRecorded events with an unknown layout, the program was likely upgraded`);

  const SOL = ADDRESSES.solana.SOL;
  rows.filter((row: any) => String(row.row_kind).toLowerCase() === "revenue").forEach((row: any) => {
    const label = KINDS[Number(row.kind)];
    if (!label) throw new Error(`realize: unknown revenue kind ${row.kind}`);
    const total = BigInt(row.lamports), buyback = BigInt(row.buyback), operations = BigInt(row.operations);
    const builders = BigInt(row.builders), suppliers = BigInt(row.suppliers), house = BigInt(row.house);
    // the legs and the Reserve's two credits add up to the payment, to the lamport (checked by the program)
    if (buyback + operations + builders + suppliers + house !== total) throw new Error(`realize: revenue legs of kind ${row.kind} do not add up`);

    dailyFees.add(SOL, total.toString(), label);
    dailyRevenue.add(SOL, total.toString(), label);
    // where each payment went, all of it protocol revenue
    dailyProtocolRevenue.add(SOL, buyback.toString(), `${label} To Buyback Vault`);
    dailyProtocolRevenue.add(SOL, operations.toString(), `${label} To Operations`);
    dailyProtocolRevenue.add(SOL, builders.toString(), `${label} To Builder Rewards`);
    dailyProtocolRevenue.add(SOL, (suppliers + house).toString(), `${label} To Launch Reserve`);
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "All revenue paid into the realize Revenue Router, read from the program's RevenueRecorded events: the Launch Reserve's returns above the principal of each launch it funds (creator fees and program sales past purchase cost), launch creation fees, creator fee shares and the other fees builders pay to the protocol.",
  Revenue: "All of it. Every payment into the Revenue Router is protocol revenue; the router then splits it on-chain between the buyback vault (40%), the Launch Reserve (40%), operations (15%) and Builder Rewards (5%).",
  ProtocolRevenue: "Same as Revenue, broken down by the leg of the Revenue Router each lamport went to.",
};

const labels = Object.values(KINDS);
const breakdownMethodology = {
  Fees: Object.fromEntries(labels.map((l) => [l, `${l} paid into the Revenue Router.`])),
  Revenue: Object.fromEntries(labels.map((l) => [l, `${l} paid into the Revenue Router.`])),
  ProtocolRevenue: Object.fromEntries(labels.flatMap((l) => [
    [`${l} To Buyback Vault`, `The buyback leg of ${l}, held in the program's buyback vault for $REALIZE buy-and-burns.`],
    [`${l} To Operations`, `The operations and security leg of ${l}.`],
    [`${l} To Builder Rewards`, `The Builder Rewards leg of ${l}, paid to Partner builders as milestone prizes.`],
    [`${l} To Launch Reserve`, `The Launch Reserve leg of ${l}, credited to the Reserve's rSOL suppliers and house capital.`],
  ])),
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  // first program transaction on mainnet: 2026-09-28 00:28 UTC
  start: "2026-09-28",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;

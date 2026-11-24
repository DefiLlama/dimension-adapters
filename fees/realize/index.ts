import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { assertComplete, programEventsSql, u64, u8 } from "../../helpers/alliumSolanaEvents";
import { base58Decode } from "../../helpers/solana";

// realize program, its Revenue Router emits one RevenueRecorded event per payment
const PROGRAM = "5BEMuVyRY43q8ZnsTVJHqj6fGjXrGew4HCXbNwWXCoKJ";
// realize's own pool authority, pools opened by others are ignored
const AUTHORITY = "Eqsq1vJRSuRUAp1siGM53Fq5ssaZ4Fteq5kuC1pKGtgN";
const AUTHORITY_HEX = Buffer.from(base58Decode(AUTHORITY)).toString("hex");

// RevenueRecorded (program IDL), byte offsets: authority 8, kind 105, lamports 106, legs 250 (buyback, operations,
// builder rewards, Reserve, POL), to_suppliers 290, to_house 298
const REVENUE_RECORDED = "BC2BC242A0B9F4F0";
const REVENUE_RECORDED_LENGTH = 322;

// indexed by the program's RevenueKind
const KINDS = [
  { label: "Launch Creation Fees", description: "Fees Partner builders pay to create a launch." },
  { label: "Success Share", description: "Success shares Partner launches pay to realize." },
  { label: "Creator Fee Share", description: "realize's share of the Pump.fun creator fees of Partner launches." },
  { label: "Founder Purchase Fees", description: "Fees on founder purchases in Partner launches." },
  { label: "Other Protocol Fees", description: "Other fees Partner builders pay to realize." },
  { label: "Launch Returns Above Principal", description: "The Launch Reserve's returns above the principal it put into each launch, from creator fees and token sales past purchase cost." },
  { label: "Launch Extension Fees", description: "Fees Partner builders pay to extend a launch." },
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
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
  if (Number(check.unknown_layout) > 0) throw new Error(`realize: ${check.unknown_layout} RevenueRecorded events with an unknown layout`);

  const SOL = ADDRESSES.solana.SOL;
  rows.filter((row: any) => String(row.row_kind).toLowerCase() === "revenue").forEach((row: any) => {
    const kind = KINDS[Number(row.kind)];
    if (!kind) throw new Error(`realize: unknown revenue kind ${row.kind}`);
    const [total, buyback, operations, builders, suppliers, house] =
      [row.lamports, row.buyback, row.operations, row.builders, row.suppliers, row.house].map((amount) => BigInt(amount));
    if (buyback + operations + builders + suppliers + house !== total) throw new Error(`realize: revenue legs of ${kind.label} do not add up`);

    const { label } = kind;
    dailyFees.add(SOL, total.toString(), label);
    dailySupplySideRevenue.add(SOL, suppliers.toString(), `${label} To Reserve Suppliers`);
    dailySupplySideRevenue.add(SOL, builders.toString(), `${label} To Builder Rewards`);
    dailyRevenue.add(SOL, buyback.toString(), `${label} To Buyback`);
    dailyRevenue.add(SOL, operations.toString(), `${label} To Operations`);
    dailyRevenue.add(SOL, house.toString(), `${label} To House Capital`);
    dailyHoldersRevenue.add(SOL, buyback.toString(), `${label} To Buyback`);
    dailyProtocolRevenue.add(SOL, operations.toString(), `${label} To Operations`);
    dailyProtocolRevenue.add(SOL, house.toString(), `${label} To House Capital`);
  });

  return { dailyFees, dailyRevenue, dailySupplySideRevenue, dailyHoldersRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "Fees Partner launches pay to realize (launch creation, extension and founder purchase fees, success and creator fee shares) plus the Launch Reserve's returns above the principal it puts into each launch; pools run by other operators are excluded.",
  Revenue: "The part of realize's fees and Launch Reserve returns kept by the protocol: the buyback vault, operations and the house's share of the Launch Reserve.",
  SupplySideRevenue: "The part of realize's fees and Launch Reserve returns paid to Launch Reserve suppliers (rSOL holders) and to the Builder Rewards vault for Partner builders.",
  HoldersRevenue: "The part of realize's fees and Launch Reserve returns sent to the buyback vault for $REALIZE buy-and-burns.",
  ProtocolRevenue: "The part of realize's fees and Launch Reserve returns sent to operations and to the house's capital in the Launch Reserve.",
};

const LEGS: Record<string, (label: string) => string> = {
  "Buyback": (label) => `The buyback leg of ${label}, held in the buyback vault for $REALIZE buy-and-burns.`,
  "Operations": (label) => `The operations and security leg of ${label}.`,
  "House Capital": (label) => `The house's share of the Launch Reserve leg of ${label}.`,
  "Reserve Suppliers": (label) => `The rSOL suppliers' share of the Launch Reserve leg of ${label}.`,
  "Builder Rewards": (label) => `The Builder Rewards leg of ${label}, paid to Partner builders as milestone prizes.`,
};
const legBreakdown = (legs: string[]) =>
  Object.fromEntries(KINDS.flatMap(({ label }) => legs.map((leg) => [`${label} To ${leg}`, LEGS[leg](label)])));

const breakdownMethodology = {
  Fees: Object.fromEntries(KINDS.map(({ label, description }) => [label, description])),
  Revenue: legBreakdown(["Buyback", "Operations", "House Capital"]),
  SupplySideRevenue: legBreakdown(["Reserve Suppliers", "Builder Rewards"]),
  HoldersRevenue: legBreakdown(["Buyback"]),
  ProtocolRevenue: legBreakdown(["Operations", "House Capital"]),
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

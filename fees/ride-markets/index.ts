import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { timeFilter, u64, u8 } from "../../helpers/alliumSolanaEvents";
import { base58Decode, base58Encode, findProgramAddress, getAccountBuffers, getProgramAccounts, solanaRpc } from "../../helpers/solana";

// On Ride Markets, the callers choose coin, duration, direction (up/down) and place a trade from
// treasury. Each trade is executed through our Trade Executor program.
// https://solscan.io/account/tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA
const TRADE_EXECUTOR = "tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA";

// Ride Markets collects every fee in USDC into this wallet.
// https://solscan.io/account/ejBYopijneorWAQ1rN6FiZMvmfXbcjcz4mELCNMRsPW
const FEE_WALLET = "ejBYopijneorWAQ1rN6FiZMvmfXbcjcz4mELCNMRsPW";

// Settlement fee schedule, from the program.
const SWAP_FEE_BPS = 70; // 0.7% of the USDC returned to the treasury
const PAYOUT_RATIOS = [9, 99]; // caller share / profit fee, could be either 1% or 10%
const RATIO_TOLERANCE = 0.005; // absorbs the program's integer division

// The treasury is paid `gross - floor(gross * 70 / 10000)`, so its net recovers the gross.
const grossFromNet = (net: number): number => {
  const approx = Math.round(net / (1 - SWAP_FEE_BPS / 10000));
  for (const gross of [approx - 2, approx - 1, approx, approx + 1, approx + 2]) {
    if (gross - Math.floor((gross * SWAP_FEE_BPS) / 10000) === net) return gross;
  }
  return approx;
};

// A settlement instruction pays USDC to the fee wallet, to the treasury, and when the trade closed a linked
// position with profit - to the caller.
// If the trade yields profit, the protocol charges either 1% or 10% profit fees, and the caller's share 
// must then be exactly 99x or 9x that profit fee.
const callerShare = (feeTotal: number, payouts: number[]): number => {
  if (feeTotal <= 0 || payouts.length < 2) return 0;
  let bestError = Infinity;
  let bestCaller = 0;
  for (let i = 0; i < payouts.length; i++) {
    const treasury = payouts[i];
    const profitFee = feeTotal - (grossFromNet(treasury) - treasury);
    if (profitFee <= 0) continue;
    const rest = payouts.reduce((sum, p, j) => (j === i ? sum : sum + p), 0);
    for (const ratio of PAYOUT_RATIOS) {
      const error = Math.abs(rest - profitFee * ratio) / Math.max(rest, 1);
      if (error <= RATIO_TOLERANCE && error < bestError) {
        bestError = error;
        bestCaller = rest;
      }
    }
  }
  return bestCaller;
};

// Ride Launchpad: every coin launches through this program on a Meteora Dynamic Bonding Curve (DBC) pool under
// Ride's DBC config, and once bonded migrates to a Meteora DAMM v2 pool. Swaps run on Meteora, and Ride's share of
// each swap fee accrues there; the launchpad program never touches it.
// https://solscan.io/account/ridehgpxLaFr17WQUwmnTrHgDpKTpF9SNPNQoeui3GF
const LAUNCHPAD = "ridehgpxLaFr17WQUwmnTrHgDpKTpF9SNPNQoeui3GF";
const LAUNCH_DISCRIMINATOR = "R7vQE78exjo"; // base58 of the Anchor `Launch` account discriminator 903333a3ce55d526
// https://solscan.io/account/4gg862r92UbSzMMo9oVVJ5JMkqrg841yAuRbpp2dj1UT
const DBC_CONFIG = "4gg862r92UbSzMMo9oVVJ5JMkqrg841yAuRbpp2dj1UT";
const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const DAMM_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Meteora emits its events with emit_cpi!, as self-CPIs: 8-byte tag, 8-byte discriminator, then the Borsh body.
// A DBC swap emits EvtSwap, EvtSwap2 and EvtSwap3 for the same trade, so only EvtSwap3 is counted and EvtSwap2 is
// read only to check that every trade still has its EvtSwap3.
const EVENT_CPI_TAG = "e445a52e51cb9a1d";
const DBC_EVT_SWAP2 = "bd4233a826507599";
const DBC_EVT_SWAP3 = "bb77f80dafff403f";
const DAMM_EVT_SWAP2 = "bd4233a826507599";
// event lengths in bytes, tag and discriminator included
const DBC_EVT_SWAP2_LENGTH = 195;
const DBC_EVT_SWAP3_LENGTH = 172;
const DAMM_EVT_SWAP2_LENGTH = 196;

const DBC_CONFIG_HEX = Buffer.from(base58Decode(DBC_CONFIG)).toString("hex");
const u128 = (data: Buffer, offset: number) => BigInt("0x" + (Buffer.from(data.subarray(offset, offset + 16)).reverse().toString("hex")));

type AmmPool = { rideLiquidity: bigint; sqrtMinPrice: bigint };

// Ride's DAMM v2 pools, with the liquidity Ride owns in each. At migration the DBC config gives the partner 20% of
// the pool's liquidity as a permanently locked position (partnerPermanentLockedLiquidityPercentage 20,
// partnerLiquidityPercentage 0), held by the config's fee claimer. Locked liquidity can never be withdrawn, so
// reading it now gives the amount Ride held at any earlier time the pool existed.
const getRideAmmPools = async (feeClaimer: string): Promise<Record<string, AmmPool>> => {
  // Launch (glide IDL): creator, base_mint, dbc_pool, three u8 splits, staking enum, vault_treasury Option<Pubkey>,
  // state enum (1 = Bonded), damm_pool
  const launches = await getProgramAccounts({
    programId: LAUNCHPAD,
    encoding: "base64",
    filters: [{ memcmp: { offset: 0, bytes: LAUNCH_DISCRIMINATOR } }],
  });
  const ammPools: string[] = [];
  launches.forEach((launch: any) => {
    const data = Buffer.from(launch.account.data[0], "base64");
    let offset = 108;
    offset += data[offset] === 1 ? 33 : 1;
    const bonded = data[offset] === 1;
    if (bonded) ammPools.push(base58Encode(data.subarray(offset + 1, offset + 33)));
  });
  if (!ammPools.length) return {};

  // Ride's DAMM positions are the position NFTs (Token-2022, amount 1) held by the fee claimer
  const nfts = await solanaRpc("getTokenAccountsByOwner", [feeClaimer, { programId: TOKEN_2022_PROGRAM }, { encoding: "base64" }]);
  const positions = nfts.value
    .map((account: any) => Buffer.from(account.account.data[0], "base64"))
    .filter((data: Buffer) => data.readBigUInt64LE(64) === 1n)
    .map((data: Buffer) => findProgramAddress([Buffer.from("position"), data.subarray(0, 32)], DAMM_PROGRAM)[0]);
  // DAMM Position (idls/cp_amm.json): pool at 8, permanent_locked_liquidity at 184
  const rideLiquidity: Record<string, bigint> = {};
  const positionBuffers = await getAccountBuffers({ chain: "solana", accounts: positions });
  positionBuffers.forEach((data: Buffer | null) => {
    if (!data) return;
    const pool = base58Encode(data.subarray(8, 40));
    rideLiquidity[pool] = (rideLiquidity[pool] ?? 0n) + u128(data, 184);
  });

  // DAMM Pool (idls/cp_amm.json): token_b_mint at 200, sqrt_min_price at 424, collect_fee_mode at 484
  const poolBuffers = await getAccountBuffers({ chain: "solana", accounts: ammPools });
  const pools: Record<string, AmmPool> = {};
  ammPools.forEach((pool, i) => {
    const data = poolBuffers[i];
    if (!data) throw new Error(`ride-markets: DAMM pool ${pool} not found`);
    if (base58Encode(data.subarray(200, 232)) !== ADDRESSES.solana.USDC) throw new Error(`ride-markets: DAMM pool ${pool} is not quoted in USDC`);
    // 1 = fees only in token B (USDC)
    if (data[484] !== 1) throw new Error(`ride-markets: DAMM pool ${pool} collects fees in mode ${data[484]}`);
    if (!rideLiquidity[pool]) throw new Error(`ride-markets: no Ride position found in DAMM pool ${pool}`);
    pools[pool] = { rideLiquidity: rideLiquidity[pool], sqrtMinPrice: u128(data, 424) };
  });
  return pools;
};

// Launchpad swap fees in USDC (raw units). DBC: `trading_fee` is the swap fee after Meteora's protocol and referral
// cut, split between the coin's creator (the config's creator_trading_fee_percentage) and Ride as the partner.
// DAMM v2: `claiming_fee` is the swap fee paid to the pool's LPs, shared by liquidity, so Ride's part is its
// liquidity over the pool's. The pool's liquidity is not in the event; its full-range reserve gives it exactly:
// reserve_b = liquidity * (sqrt_price - sqrt_min_price) >> 128.
const getLaunchpadFees = async (options: FetchOptions) => {
  // DBC PoolConfig (idls/dynamic_bonding_curve.json): fee_claimer at 40, creator_trading_fee_percentage at 245.
  // The config is immutable, so its current values apply to every past swap.
  const [config] = await getAccountBuffers({ chain: "solana", accounts: [DBC_CONFIG] });
  if (!config) throw new Error(`ride-markets: DBC config ${DBC_CONFIG} not found`);
  const creatorPercentage = BigInt(config.readUInt8(245));
  const ammPools = await getRideAmmPools(base58Encode(config.subarray(40, 72)));
  const ammPoolHexes = Object.keys(ammPools).map((pool) => `'${Buffer.from(base58Decode(pool)).toString("hex")}'`);

  const rows = await queryAllium(`
    WITH events AS (
      SELECT txn_id, program_id, SUBSTR(data_hex, 17, 16) AS event, LENGTH(data_hex) / 2 AS len, data_hex
      FROM solana.raw.inner_instructions
      WHERE program_id IN ('${DBC_PROGRAM}', '${DAMM_PROGRAM}')
        AND parent_tx_success
        AND ${timeFilter(options)}
        AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'
        AND (
          -- DBC EvtSwap2 / EvtSwap3: pool, then config
          (program_id = '${DBC_PROGRAM}' AND SUBSTR(data_hex, 17, 16) IN ('${DBC_EVT_SWAP2}', '${DBC_EVT_SWAP3}')
            AND SUBSTR(data_hex, 97, 64) = '${DBC_CONFIG_HEX}')
          -- DAMM EvtSwap2: pool first
          OR (program_id = '${DAMM_PROGRAM}' AND SUBSTR(data_hex, 17, 16) = '${DAMM_EVT_SWAP2}'
            AND ${ammPoolHexes.length ? `SUBSTR(data_hex, 33, 64) IN (${ammPoolHexes.join(", ")})` : "FALSE"})
        )
    ),
    curve AS (
      -- EvtSwap3: trading_fee at 116, fee_on_base_token at 83
      SELECT data_hex FROM events
      WHERE program_id = '${DBC_PROGRAM}' AND event = '${DBC_EVT_SWAP3}' AND len = ${DBC_EVT_SWAP3_LENGTH}
        AND ${u8("data_hex", 83)} = '00'
    ),
    amm AS (
      -- EvtSwap2: pool at 16, collect_fee_mode at 49, next_sqrt_price at 100, claiming_fee at 116,
      -- compounding_fee at 132, reserve_b_amount at 188
      SELECT data_hex FROM events
      WHERE program_id = '${DAMM_PROGRAM}' AND len = ${DAMM_EVT_SWAP2_LENGTH}
        AND ${u8("data_hex", 49)} = '01' AND ${u64("data_hex", 132)} = 0
    ),
    unpaired AS (
      SELECT txn_id
      FROM events
      WHERE program_id = '${DBC_PROGRAM}'
      GROUP BY txn_id
      HAVING COUNT_IF(event = '${DBC_EVT_SWAP2}') <> COUNT_IF(event = '${DBC_EVT_SWAP3}')
    ),
    checks AS (
      SELECT
        (SELECT COUNT(*) FROM events) - (SELECT COUNT(*) FROM curve) - (SELECT COUNT(*) FROM amm)
          - (SELECT COUNT(*) FROM events WHERE program_id = '${DBC_PROGRAM}' AND event = '${DBC_EVT_SWAP2}' AND len = ${DBC_EVT_SWAP2_LENGTH}) AS unknown_layout,
        (SELECT COUNT(*) FROM unpaired) AS unpaired_txs,
        (SELECT MIN(txn_id) FROM unpaired) AS unpaired_tx,
        -- the transfers table is built from the raw ones, so rows past the window mean the window is complete
        EXISTS (SELECT 1 FROM solana.assets.transfers
          WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT 'check' AS kind, unknown_layout, unpaired_txs, unpaired_tx, indexed, NULL AS pool, NULL AS fee, NULL AS sqrt_price, NULL AS reserve
    FROM checks
    UNION ALL
    SELECT 'curve', NULL, NULL, NULL, NULL, NULL, COALESCE(SUM(${u64("data_hex", 116)}), 0), NULL, NULL
    FROM curve
    UNION ALL
    SELECT 'amm', NULL, NULL, NULL, NULL, SUBSTR(data_hex, 33, 64), ${u64("data_hex", 116)}, SUBSTR(data_hex, 201, 32), ${u64("data_hex", 188)}
    FROM amm
  `);

  const check = rows.find((row: any) => String(row.kind).toLowerCase() === "check");
  if (!check) throw new Error("ride-markets: empty Allium response");
  if (!check.indexed) throw new Error(`ride-markets: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(check.unknown_layout) > 0) throw new Error(`ride-markets: ${check.unknown_layout} Meteora swap events with an unknown layout, the program was likely upgraded`);
  if (Number(check.unpaired_txs) > 0) throw new Error(`ride-markets: DBC swaps in ${check.unpaired_tx} (and ${Number(check.unpaired_txs) - 1} others) do not emit one EvtSwap3 per EvtSwap2`);

  let curveFees = 0n;
  let ammFees = 0n;
  let ammRideFees = 0n;
  rows.forEach((row: any) => {
    const kind = String(row.kind).toLowerCase();
    if (kind === "curve") curveFees = BigInt(row.fee);
    if (kind !== "amm") return;
    const { rideLiquidity, sqrtMinPrice } = ammPools[base58Encode(Buffer.from(row.pool, "hex"))];
    const fee = BigInt(row.fee);
    const sqrtPrice = u128(Buffer.from(row.sqrt_price, "hex"), 0);
    const reserve = BigInt(row.reserve);
    if (reserve === 0n) throw new Error(`ride-markets: DAMM swap with an empty USDC reserve in pool ${row.pool}`);
    ammFees += fee;
    // fee * rideLiquidity / poolLiquidity, with poolLiquidity = (reserve << 128) / (sqrtPrice - sqrtMinPrice)
    ammRideFees += (fee * rideLiquidity * (sqrtPrice - sqrtMinPrice)) / (reserve << 128n);
  });
  const curveCreatorFees = (curveFees * creatorPercentage) / 100n;

  return {
    curveFees: curveFees.toString(),
    curveRideFees: (curveFees - curveCreatorFees).toString(),
    curveCreatorFees: curveCreatorFees.toString(),
    ammFees: ammFees.toString(),
    ammRideFees: ammRideFees.toString(),
    ammLpFees: (ammFees - ammRideFees).toString(),
  };
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const timeRange = `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  // One Allium job: settlement legs (program USDC transfers, vault-keyed so two
  // settlements in the same tx stay split) plus fee-wallet inflows on txs that
  // invoke Trade Executor. `create_intent` is a CPI, so match `program_id` on
  // `solana.raw.instructions` rather than scanning `solana.raw.transactions`.
  const query = `
    WITH ride_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.raw.instructions
      WHERE program_id = '${TRADE_EXECUTOR}'
        AND ${timeRange}
    ),
    program_transfers AS (
      SELECT txn_id, from_address, to_address, raw_amount
      FROM solana.assets.transfers
      WHERE outer_program_id = '${TRADE_EXECUTOR}'
        AND mint = '${ADDRESSES.solana.USDC}'
        AND ${timeRange}
    ),
    fee_legs AS (
      SELECT txn_id, from_address AS vault, SUM(raw_amount) AS fee_total
      FROM program_transfers
      WHERE to_address = '${FEE_WALLET}'
      GROUP BY txn_id, from_address
    ),
    payouts AS (
      SELECT txn_id, from_address AS vault, to_address AS recipient, SUM(raw_amount) AS amount
      FROM program_transfers
      WHERE to_address != '${FEE_WALLET}'
      GROUP BY txn_id, from_address, to_address
    ),
    fee_inflows AS (
      SELECT txn_id, raw_amount
      FROM solana.assets.transfers
      WHERE to_address = '${FEE_WALLET}'
        AND from_address != '${FEE_WALLET}'
        AND mint = '${ADDRESSES.solana.USDC}'
        AND ${timeRange}
    )
    SELECT 'settlement' AS kind, f.txn_id AS txn_id, f.vault AS vault, f.fee_total AS fee_total, p.amount AS amount
    FROM fee_legs f
    LEFT JOIN payouts p ON p.txn_id = f.txn_id AND p.vault = f.vault
    UNION ALL
    SELECT 'inflow' AS kind, NULL AS txn_id, NULL AS vault, NULL AS fee_total, COALESCE(SUM(i.raw_amount), 0) AS amount
    FROM fee_inflows i
    INNER JOIN ride_txs r ON r.txn_id = i.txn_id
  `;

  const rows = await queryAllium(query);

  const settlements = new Map<string, { feeTotal: number; payouts: number[] }>();
  let inflowAmount = 0;
  rows.forEach((row: any) => {
    if (String(row.kind).toLowerCase() === "inflow") {
      inflowAmount = Number(row.amount ?? 0);
      return;
    }
    const key = `${row.txn_id}:${row.vault}`;
    if (!settlements.has(key)) settlements.set(key, { feeTotal: Number(row.fee_total), payouts: [] });
    if (row.amount) settlements.get(key)!.payouts.push(Number(row.amount));
  });

  let settlementFees = 0;
  let callerFees = 0;
  settlements.forEach(({ feeTotal, payouts }) => {
    settlementFees += feeTotal;
    callerFees += callerShare(feeTotal, payouts);
  });
  const openingFees = inflowAmount - settlementFees;

  const usdc = ADDRESSES.solana.USDC;
  dailyFees.add(usdc, openingFees, "Trade Opening Fees");
  dailyFees.add(usdc, settlementFees, "Settlement Fees");
  dailyFees.add(usdc, callerFees, "Caller Profit Share");
  dailyRevenue.add(usdc, openingFees, "Trade Opening Fees To Protocol");
  dailyRevenue.add(usdc, settlementFees, "Settlement Fees To Protocol");
  dailySupplySideRevenue.add(usdc, callerFees, "Caller Profit Share To Callers");

  const launchpad = await getLaunchpadFees(options);
  dailyFees.add(usdc, launchpad.curveFees, "Launchpad Bonding Curve Fees");
  dailyFees.add(usdc, launchpad.ammFees, "Launchpad AMM Fees");
  dailyRevenue.add(usdc, launchpad.curveRideFees, "Launchpad Bonding Curve Fees To Protocol");
  dailyRevenue.add(usdc, launchpad.ammRideFees, "Launchpad AMM Fees To Protocol");
  dailySupplySideRevenue.add(usdc, launchpad.curveCreatorFees, "Launchpad Bonding Curve Fees To Creators");
  dailySupplySideRevenue.add(usdc, launchpad.ammLpFees, "Launchpad AMM Fees To Other LPs");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Everything paid to trade on Ride Markets, in USDC: a fee when a trade is opened, a fee when it settles, the share of the profit paid to the caller who deployed the trade, and the trading fees on coins launched through the Ride Launchpad.",
  Revenue: "The opening and settlement fees, plus Ride's share of launchpad trading fees, which the protocol keeps.",
  ProtocolRevenue: "The opening and settlement fees, plus Ride's share of launchpad trading fees, which the protocol keeps.",
  SupplySideRevenue: "The profit share paid to callers, and the launchpad trading fees paid to coin creators and liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    "Trade Opening Fees": "Charged when a trade is opened, based on its volume. Taken by the frontend as a direct USDC transfer to the fee wallet, outside the Trade Executor program, so it is counted only in transactions that invoke that program (including CPI `create_intent`) and only for what the settlement fees do not already account for.",
    "Settlement Fees": "Charged by the Trade Executor program when a trade settles: 0.7% of the USDC returned to the treasury, plus a cut of the caller's profit share.",
    "Caller Profit Share": "Paid out of the treasury's realised profit to the caller who deployed the trade, at a rate the DAO sets. The protocol sets and enforces this rate but does not receive it.",
    "Launchpad Bonding Curve Fees": "Trading fees on coins launched through the Ride Launchpad while they trade on their bonding curve.",
    "Launchpad AMM Fees": "Trading fees on launched coins after they graduate to an AMM pool.",
  },
  Revenue: {
    "Trade Opening Fees To Protocol": "All trade opening fees are paid to the Ride Markets fee wallet.",
    "Settlement Fees To Protocol": "All settlement fees are paid to the Ride Markets fee wallet.",
    "Launchpad Bonding Curve Fees To Protocol": "Ride's share of bonding curve trading fees.",
    "Launchpad AMM Fees To Protocol": "Ride's share of AMM trading fees.",
  },
  ProtocolRevenue: {
    "Trade Opening Fees To Protocol": "All trade opening fees are paid to the Ride Markets fee wallet.",
    "Settlement Fees To Protocol": "All settlement fees are paid to the Ride Markets fee wallet.",
    "Launchpad Bonding Curve Fees To Protocol": "Ride's share of bonding curve trading fees.",
    "Launchpad AMM Fees To Protocol": "Ride's share of AMM trading fees.",
  },
  SupplySideRevenue: {
    "Caller Profit Share To Callers": "Paid straight from the trade's proceeds to the caller, as the cost of sourcing the trade.",
    "Launchpad Bonding Curve Fees To Creators": "The creators' share of bonding curve trading fees, shared with the coin's vault and stakers.",
    "Launchpad AMM Fees To Other LPs": "The share of AMM trading fees earned by the coin's other liquidity providers, mainly its own creator position, which is shared with the coin's vault and stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-06-11",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;

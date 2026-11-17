/**
 * Nyraa (https://nyraa.xyz) is a memecoin launchpad on Solana. Coins launch on Meteora's Dynamic Bonding Curve (DBC)
 * program under Nyraa's own config and, once their curve is full, graduate to a Meteora DAMM v2 pool whose liquidity
 * is locked for good: half in Nyraa's position, half in the creator's.
 * Fee split as published by Nyraa: https://nyraa.xyz/whitepaper (section 4, "Fees and Revenue").
 *
 * Nyraa's configs are every DBC PoolConfig whose fee claimer is Nyraa's revenue wallet. The fee claimer is fixed when
 * a config is created, and the DBC program gives it the partner's locked LP position at graduation.
 *
 * Bonding curves: the trader pays trading_fee + protocol_fee + referral_fee. Meteora keeps the protocol fee, the
 * referral fee goes to the referrer a swap names, and the trading fee is split between the coin's creator (the
 * config's creator_trading_fee_percentage, 50 in Nyraa's config) and Nyraa.
 * Graduated pools: the trader pays claiming_fee + compounding_fee (the LPs' fee) + protocol_fee + referral_fee. The LP
 * fee is shared by liquidity, so Nyraa's part is its locked liquidity over the pool's at each swap.
 */
import { createHash } from "crypto";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryAllium } from "../helpers/allium";
import { timeFilter, u64, u8 } from "../helpers/alliumSolanaEvents";
import { base58Decode, base58Encode, findProgramAddress, getAccountBuffers, getProgramAccounts, solanaRpc } from "../helpers/solana";

// Nyraa's revenue wallet, and the fee claimer of its DBC configs
// https://solscan.io/account/HB62sq7jc85nGZMAMZZRa6pyWU1k2FniZdN1Qy7q3L4b
const FEE_CLAIMER = "HB62sq7jc85nGZMAMZZRa6pyWU1k2FniZdN1Qy7q3L4b";
const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
const DAMM_PROGRAM = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

// Anchor account discriminators: the first 8 bytes of sha256("account:<Name>")
const discriminator = (name: string) => createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
const POOL_CONFIG = discriminator("PoolConfig");
const VIRTUAL_POOL = discriminator("VirtualPool");
const POSITION = discriminator("Position");

// Meteora emits its events with emit_cpi!, as calls to itself: an 8-byte tag, the 8-byte event discriminator (first
// 8 bytes of sha256("event:<Name>")), then the Borsh body.
// A DBC swap emits EvtSwap, EvtSwap2 and EvtSwap3 for the same trade, so only EvtSwap3 is counted; EvtSwap2 is read
// only to check that every trade still has its EvtSwap3.
const EVENT_CPI_TAG = "e445a52e51cb9a1d";
const DBC_EVT_SWAP2 = "bd4233a826507599";
const DBC_EVT_SWAP3 = "bb77f80dafff403f";
const DAMM_EVT_SWAP2 = "bd4233a826507599";
// event lengths in bytes, tag and discriminator included
const DBC_EVT_SWAP2_LENGTH = 195;
const DBC_EVT_SWAP3_LENGTH = 172;
const DAMM_EVT_SWAP2_LENGTH = 196;

// Fees are counted in a config's quote token when it is one of these. Nyraa's only config is quoted in SOL.
const QUOTE_MINTS = [ADDRESSES.solana.SOL, ADDRESSES.solana.USDC];

const LABELS = {
  CURVE_FEES: "Bonding Curve Trading Fees",
  CURVE_FEES_TO_NYRAA: "Bonding Curve Trading Fees To Nyraa",
  CURVE_FEES_TO_CREATORS: "Bonding Curve Trading Fees To Creators",
  CURVE_FEES_TO_METEORA: "Bonding Curve Trading Fees To Meteora",
  CURVE_FEES_TO_REFERRALS: "Bonding Curve Trading Fees To Referrals",
  POOL_FEES: "Graduated Pool Trading Fees",
  POOL_FEES_TO_NYRAA: "Graduated Pool Trading Fees To Nyraa",
  POOL_FEES_TO_LPS: "Graduated Pool Trading Fees To Creators And Other LPs",
  POOL_FEES_TO_METEORA: "Graduated Pool Trading Fees To Meteora",
  POOL_FEES_TO_REFERRALS: "Graduated Pool Trading Fees To Referrals",
};

const toHex = (address: string) => Buffer.from(base58Decode(address)).toString("hex");
const u128 = (data: Buffer, offset: number) => BigInt("0x" + Buffer.from(data.subarray(offset, offset + 16)).reverse().toString("hex"));
const maxKey = (a: Buffer, b: Buffer) => (Buffer.compare(a, b) >= 0 ? a : b);
const minKey = (a: Buffer, b: Buffer) => (Buffer.compare(a, b) >= 0 ? b : a);

type Config = { quoteMint: string; creatorPercentage: number };
type GraduatedPool = { quoteMint: string; nyraaLiquidity: bigint; sqrtMinPrice: bigint };

// Nyraa's DBC configs, by fee claimer.
// DBC PoolConfig (MeteoraAg/dynamic-bonding-curve state/config.rs): quote_mint at 8, fee_claimer at 40,
// collect_fee_mode at 232, creator_trading_fee_percentage at 245. A config is immutable, so its current values apply
// to every past swap.
const getConfigs = async (): Promise<Record<string, Config>> => {
  const accounts = await getProgramAccounts({
    programId: DBC_PROGRAM,
    encoding: "base64",
    filters: [
      { memcmp: { offset: 0, bytes: base58Encode(POOL_CONFIG) } },
      { memcmp: { offset: 40, bytes: FEE_CLAIMER } },
    ],
  });
  if (!accounts.length) throw new Error("nyraa: no DBC config found for the fee claimer");
  const configs: Record<string, Config> = {};
  accounts.forEach(({ pubkey, account }) => {
    const data = Buffer.from(account.data[0], "base64");
    // collect_fee_mode 0: the curve fee is always taken in the quote token
    if (data.readUInt8(232) !== 0) throw new Error(`nyraa: DBC config ${pubkey} does not collect fees in the quote token`);
    const quoteMint = base58Encode(data.subarray(8, 40));
    // quote tokens with no reliable price are left out
    if (!QUOTE_MINTS.includes(quoteMint)) return;
    configs[pubkey] = { quoteMint, creatorPercentage: data.readUInt8(245) };
  });
  return configs;
};

// The DAMM v2 pools Nyraa coins graduated to, with the liquidity Nyraa owns in each. At graduation the DBC program
// locks the partner's share of the liquidity (partner_permanent_locked_liquidity_percentage 50 in Nyraa's config) in
// a position whose NFT (Token-2022, amount 1) goes to the config's fee claimer. Locked liquidity can never be
// withdrawn, so reading it now gives the amount Nyraa held at any earlier time the pool existed.
const getGraduatedPools = async (configs: Record<string, Config>): Promise<Record<string, GraduatedPool>> => {
  // SPL token account: mint at 0, amount at 64
  const nfts = await solanaRpc("getTokenAccountsByOwner", [FEE_CLAIMER, { programId: TOKEN_2022_PROGRAM }, { encoding: "base64" }]);
  const positions: string[] = nfts.value
    .map((account: any) => Buffer.from(account.account.data[0], "base64"))
    .filter((data: Buffer) => data.readBigUInt64LE(64) === 1n)
    .map((data: Buffer) => findProgramAddress([Buffer.from("position"), data.subarray(0, 32)], DAMM_PROGRAM)[0]);
  if (!positions.length) return {};

  // DAMM v2 Position (MeteoraAg/damm-v2 state/position.rs): pool at 8, unlocked_liquidity at 152, vested_liquidity
  // at 168, permanent_locked_liquidity at 184. A Token-2022 NFT that is not a position has no such account.
  const nyraaLiquidity: Record<string, bigint> = {};
  const positionBuffers = await getAccountBuffers({ chain: "solana", accounts: positions });
  positionBuffers.forEach((data) => {
    if (!data || !data.subarray(0, 8).equals(POSITION)) return;
    const pool = base58Encode(data.subarray(8, 40));
    nyraaLiquidity[pool] = (nyraaLiquidity[pool] ?? 0n) + u128(data, 152) + u128(data, 168) + u128(data, 184);
  });
  const pools = Object.keys(nyraaLiquidity);
  if (!pools.length) return {};

  // DAMM v2 Pool (state/pool.rs): token_a_mint at 168, token_b_mint at 200, sqrt_min_price at 424. A pool migrated
  // from DBC has the coin as token A and the quote token as token B. The coin is a Nyraa coin when its DBC pool,
  // the PDA ["pool", config, max(base, quote), min(base, quote)], exists under one of Nyraa's configs.
  const poolBuffers = await getAccountBuffers({ chain: "solana", accounts: pools });
  const candidates: { pool: string; config: string; virtualPool: string }[] = [];
  pools.forEach((pool, i) => {
    const data = poolBuffers[i];
    if (!data) throw new Error(`nyraa: DAMM v2 pool ${pool} not found`);
    const coin = data.subarray(168, 200);
    const quote = data.subarray(200, 232);
    Object.entries(configs).forEach(([config, { quoteMint }]) => {
      if (base58Encode(quote) !== quoteMint) return;
      const [virtualPool] = findProgramAddress([Buffer.from("pool"), Buffer.from(base58Decode(config)), maxKey(coin, quote), minKey(coin, quote)], DBC_PROGRAM);
      candidates.push({ pool, config, virtualPool });
    });
  });
  if (!candidates.length) return {};

  // DBC VirtualPool: config at 72
  const virtualPoolBuffers = await getAccountBuffers({ chain: "solana", accounts: candidates.map((c) => c.virtualPool) });
  const graduated: Record<string, GraduatedPool> = {};
  candidates.forEach(({ pool, config }, i) => {
    const data = virtualPoolBuffers[i];
    if (!data || !data.subarray(0, 8).equals(VIRTUAL_POOL) || base58Encode(data.subarray(72, 104)) !== config) return;
    graduated[pool] = {
      quoteMint: configs[config].quoteMint,
      nyraaLiquidity: nyraaLiquidity[pool],
      sqrtMinPrice: u128(poolBuffers[pools.indexOf(pool)]!, 424),
    };
  });
  return graduated;
};

const fetch = async (options: FetchOptions) => {
  const configs = await getConfigs();
  const graduatedPools = await getGraduatedPools(configs);

  const configByHex: Record<string, string> = {};
  Object.keys(configs).forEach((config) => { configByHex[toHex(config)] = config; });
  const poolByHex: Record<string, string> = {};
  Object.keys(graduatedPools).forEach((pool) => { poolByHex[toHex(pool)] = pool; });
  const configHexes = Object.keys(configByHex).map((hex) => `'${hex}'`);
  const poolHexes = Object.keys(poolByHex).map((hex) => `'${hex}'`);

  // The creator's share is worked out swap by swap, rounded down as the DBC program does, so hourly windows add up
  // to exactly what a daily window gives
  const configsSql = configHexes.length
    ? `SELECT column1 AS config, column2 AS creator_pct FROM VALUES ${Object.entries(configByHex).map(([hex, config]) => `('${hex}', ${configs[config].creatorPercentage})`).join(", ")}`
    : "SELECT NULL::VARCHAR AS config, NULL::NUMBER AS creator_pct WHERE FALSE";
  // u128 values are passed as doubles: they only feed Nyraa's share of each pool, a ratio
  const poolsSql = poolHexes.length
    ? `SELECT column1 AS pool, column2::DOUBLE AS nyraa_liquidity, column3::DOUBLE AS sqrt_min_price FROM VALUES ${Object.entries(poolByHex).map(([hex, pool]) => `('${hex}', ${Number(graduatedPools[pool].nyraaLiquidity)}, ${Number(graduatedPools[pool].sqrtMinPrice)})`).join(", ")}`
    : "SELECT NULL::VARCHAR AS pool, NULL::DOUBLE AS nyraa_liquidity, NULL::DOUBLE AS sqrt_min_price WHERE FALSE";
  // little-endian u128 at a byte offset, as a double
  const u128Double = (offset: number) => `(${u64("data_hex", offset + 8)}::DOUBLE * POWER(2, 64) + ${u64("data_hex", offset)}::DOUBLE)`;

  const rows = await queryAllium(`
    WITH configs AS (${configsSql}),
    graduated_pools AS (${poolsSql}),
    events AS (
      SELECT txn_id, program_id, SUBSTR(data_hex, 17, 16) AS event, LENGTH(data_hex) / 2 AS len, data_hex
      FROM solana.raw.inner_instructions
      WHERE program_id IN ('${DBC_PROGRAM}', '${DAMM_PROGRAM}')
        AND parent_tx_success
        AND ${timeFilter(options)}
        AND LEFT(data_hex, 16) = '${EVENT_CPI_TAG}'
        AND (
          -- DBC EvtSwap2 / EvtSwap3: pool at 16, config at 48
          (program_id = '${DBC_PROGRAM}' AND SUBSTR(data_hex, 17, 16) IN ('${DBC_EVT_SWAP2}', '${DBC_EVT_SWAP3}')
            AND ${configHexes.length ? `SUBSTR(data_hex, 97, 64) IN (${configHexes.join(", ")})` : "FALSE"})
          -- DAMM v2 EvtSwap2: pool at 16
          OR (program_id = '${DAMM_PROGRAM}' AND SUBSTR(data_hex, 17, 16) = '${DAMM_EVT_SWAP2}'
            AND ${poolHexes.length ? `SUBSTR(data_hex, 33, 64) IN (${poolHexes.join(", ")})` : "FALSE"})
        )
    ),
    curve AS (
      -- EvtSwap3 (state/event.rs): fee_on_base_token at 83, trading_fee at 116, protocol_fee at 124, referral_fee at 132
      SELECT e.txn_id, c.config, ${u64("e.data_hex", 116)} AS trading_fee, c.creator_pct,
        ${u64("e.data_hex", 124)} AS protocol_fee, ${u64("e.data_hex", 132)} AS referral_fee
      FROM events e
      JOIN configs c ON c.config = SUBSTR(e.data_hex, 97, 64)
      WHERE e.program_id = '${DBC_PROGRAM}' AND e.event = '${DBC_EVT_SWAP3}' AND e.len = ${DBC_EVT_SWAP3_LENGTH}
        AND ${u8("e.data_hex", 83)} = '00'
    ),
    amm AS (
      -- EvtSwap2 (MeteoraAg/damm-v2 event.rs): trade_direction at 48, collect_fee_mode at 49, next_sqrt_price at 100,
      -- claiming_fee at 116, protocol_fee at 124, compounding_fee at 132, referral_fee at 140, reserve_b_amount at 188.
      -- The fee is taken in token A (the coin) only when collect_fee_mode is 0 (output token) and the trade buys the
      -- coin (direction 1); it is then valued in the quote token at the pool's price after the swap,
      -- (sqrt_price / 2^64)^2. Nyraa's share: its liquidity over the pool's, which the full-range reserve gives:
      -- reserve_b = liquidity * (sqrt_price - sqrt_min_price) / 2^128.
      SELECT e.txn_id, p.pool,
        ${u128Double(100)} AS sqrt_price,
        ${u64("e.data_hex", 188)}::DOUBLE AS reserve_b,
        IFF(${u8("e.data_hex", 49)} = '00' AND ${u8("e.data_hex", 48)} = '01', POWER(sqrt_price / POWER(2, 64), 2), 1) AS to_quote,
        (${u64("e.data_hex", 116)} + ${u64("e.data_hex", 132)}) * to_quote AS lp_fee,
        ${u64("e.data_hex", 124)} * to_quote AS protocol_fee,
        ${u64("e.data_hex", 140)} * to_quote AS referral_fee,
        p.nyraa_liquidity * (sqrt_price - p.sqrt_min_price) / NULLIF(reserve_b * POWER(2, 128), 0) AS nyraa_share
      FROM events e
      JOIN graduated_pools p ON p.pool = SUBSTR(e.data_hex, 33, 64)
      WHERE e.program_id = '${DAMM_PROGRAM}' AND e.len = ${DAMM_EVT_SWAP2_LENGTH}
        AND ${u8("e.data_hex", 49)} IN ('00', '01', '02')
    ),
    unexpected AS (
      -- events of an unknown layout (the program was likely upgraded), curve fees taken in the coin, a DAMM fee
      -- mode this adapter does not know, or a swap that empties the pool's quote reserve
      SELECT txn_id FROM events
      WHERE NOT (program_id = '${DBC_PROGRAM}' AND event = '${DBC_EVT_SWAP2}' AND len = ${DBC_EVT_SWAP2_LENGTH})
        AND NOT (program_id = '${DBC_PROGRAM}' AND event = '${DBC_EVT_SWAP3}' AND len = ${DBC_EVT_SWAP3_LENGTH} AND ${u8("data_hex", 83)} = '00')
        AND NOT (program_id = '${DAMM_PROGRAM}' AND len = ${DAMM_EVT_SWAP2_LENGTH} AND ${u8("data_hex", 49)} IN ('00', '01', '02'))
      UNION ALL
      SELECT txn_id FROM amm WHERE nyraa_share IS NULL OR nyraa_share > 1.000001
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
        (SELECT COUNT(*) FROM unexpected) AS unexpected_count,
        (SELECT MIN(txn_id) FROM unexpected) AS unexpected_tx,
        (SELECT COUNT(*) FROM unpaired) AS unpaired_count,
        (SELECT MIN(txn_id) FROM unpaired) AS unpaired_tx,
        -- the transfers table is built from the raw ones, so rows past the window mean the window is complete
        EXISTS (SELECT 1 FROM solana.assets.transfers
          WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT 'check' AS kind, unexpected_count, unexpected_tx, unpaired_count, unpaired_tx, indexed,
      NULL AS id, NULL AS fee, NULL AS share, NULL AS protocol, NULL AS referral
    FROM checks
    UNION ALL
    -- sums are returned as text so they reach BigInt exactly
    SELECT 'curve', NULL, NULL, NULL, NULL, NULL, config,
      TO_VARCHAR(SUM(trading_fee)), TO_VARCHAR(SUM(FLOOR(trading_fee * creator_pct / 100))), TO_VARCHAR(SUM(protocol_fee)), TO_VARCHAR(SUM(referral_fee))
    FROM curve
    GROUP BY config
    UNION ALL
    SELECT 'pool', NULL, NULL, NULL, NULL, NULL, pool,
      TO_VARCHAR(FLOOR(SUM(lp_fee))::NUMBER(38, 0)), TO_VARCHAR(FLOOR(SUM(lp_fee * LEAST(nyraa_share, 1)))::NUMBER(38, 0)),
      TO_VARCHAR(FLOOR(SUM(protocol_fee))::NUMBER(38, 0)), TO_VARCHAR(FLOOR(SUM(referral_fee))::NUMBER(38, 0))
    FROM amm
    GROUP BY pool
  `);

  const check = rows.find((row: any) => String(row.kind).toLowerCase() === "check");
  if (!check) throw new Error("nyraa: empty Allium response");
  if (!check.indexed) throw new Error(`nyraa: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(check.unexpected_count) > 0)
    throw new Error(`nyraa: ${check.unexpected_count} Meteora swap events that cannot be read (unknown layout or fee mode), e.g. in ${check.unexpected_tx}`);
  if (Number(check.unpaired_count) > 0)
    throw new Error(`nyraa: DBC swaps in ${check.unpaired_tx} (and ${Number(check.unpaired_count) - 1} others) do not emit one EvtSwap3 per EvtSwap2`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  rows.forEach((row: any) => {
    const kind = String(row.kind).toLowerCase();
    if (kind === "check") return;
    const fee = BigInt(row.fee);
    const share = BigInt(row.share);
    const protocol = BigInt(row.protocol);
    const referral = BigInt(row.referral);
    const id = String(row.id).toLowerCase();

    if (kind === "curve") {
      const config = configByHex[id];
      if (!config) throw new Error(`nyraa: Allium returned fees for unknown DBC config ${row.id}`);
      const { quoteMint } = configs[config];
      // share: the creator's part of the trading fee
      dailyFees.add(quoteMint, (fee + protocol + referral).toString(), LABELS.CURVE_FEES);
      dailyRevenue.add(quoteMint, (fee - share).toString(), LABELS.CURVE_FEES_TO_NYRAA);
      dailySupplySideRevenue.add(quoteMint, share.toString(), LABELS.CURVE_FEES_TO_CREATORS);
      dailySupplySideRevenue.add(quoteMint, protocol.toString(), LABELS.CURVE_FEES_TO_METEORA);
      dailySupplySideRevenue.add(quoteMint, referral.toString(), LABELS.CURVE_FEES_TO_REFERRALS);
      return;
    }

    const pool = poolByHex[id];
    if (!pool) throw new Error(`nyraa: Allium returned fees for unknown DAMM v2 pool ${row.id}`);
    const { quoteMint } = graduatedPools[pool];
    // share: Nyraa's part of the LP fee
    dailyFees.add(quoteMint, (fee + protocol + referral).toString(), LABELS.POOL_FEES);
    dailyRevenue.add(quoteMint, share.toString(), LABELS.POOL_FEES_TO_NYRAA);
    dailySupplySideRevenue.add(quoteMint, (fee - share).toString(), LABELS.POOL_FEES_TO_LPS);
    dailySupplySideRevenue.add(quoteMint, protocol.toString(), LABELS.POOL_FEES_TO_METEORA);
    dailySupplySideRevenue.add(quoteMint, referral.toString(), LABELS.POOL_FEES_TO_REFERRALS);
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid by traders on the bonding curves of coins launched on Nyraa and in the Meteora DAMM v2 pools those coins graduate to, including Meteora's protocol fee and referral fees. Excludes the flat 0.005 SOL launch fee and the 0.25% interface fee on token buys and sells made in Nyraa's app.",
  UserFees: "Trading fees paid by traders on the bonding curves of coins launched on Nyraa and in the Meteora DAMM v2 pools those coins graduate to, including Meteora's protocol fee and referral fees.",
  Revenue: "Nyraa's share of trading fees: what is left of the bonding-curve trading fee after Meteora's protocol fee, referral fees and the coin creator's 50%, plus the part of graduated-pool LP fees earned by Nyraa's locked liquidity.",
  ProtocolRevenue: "Nyraa's share of bonding-curve and graduated-pool trading fees, all of it to Nyraa's revenue wallet. None of it is used for NYRAA buybacks or burns.",
  SupplySideRevenue: "Trading fees paid to coin creators (50% of the bonding-curve trading fee, and the LP fees of their locked liquidity once a coin graduates), to other liquidity providers in graduated pools, to Meteora (its protocol fee) and to referrers.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.CURVE_FEES]: "Trading fees paid on Nyraa bonding curves: the creator, Nyraa, Meteora and referral shares together. The base fee is 1%; it starts at 50% and decays to 1% over a coin's first 60 seconds.",
    [LABELS.POOL_FEES]: "Trading fees paid in the Meteora DAMM v2 pools of graduated Nyraa coins: the LP fee plus Meteora's protocol and referral fees.",
  },
  UserFees: {
    [LABELS.CURVE_FEES]: "Trading fees paid on Nyraa bonding curves: the creator, Nyraa, Meteora and referral shares together. The base fee is 1%; it starts at 50% and decays to 1% over a coin's first 60 seconds.",
    [LABELS.POOL_FEES]: "Trading fees paid in the Meteora DAMM v2 pools of graduated Nyraa coins: the LP fee plus Meteora's protocol and referral fees.",
  },
  Revenue: {
    [LABELS.CURVE_FEES_TO_NYRAA]: "Nyraa's share of the bonding-curve trading fee, after the coin creator's share.",
    [LABELS.POOL_FEES_TO_NYRAA]: "LP fees earned by Nyraa's locked liquidity in graduated DAMM v2 pools, by its share of each pool's liquidity.",
  },
  ProtocolRevenue: {
    [LABELS.CURVE_FEES_TO_NYRAA]: "Nyraa's share of the bonding-curve trading fee, sent to Nyraa's revenue wallet.",
    [LABELS.POOL_FEES_TO_NYRAA]: "LP fees earned by Nyraa's locked liquidity in graduated DAMM v2 pools, claimable by Nyraa's revenue wallet.",
  },
  SupplySideRevenue: {
    [LABELS.CURVE_FEES_TO_CREATORS]: "The coin creator's configured share of the bonding-curve trading fee (50%).",
    [LABELS.CURVE_FEES_TO_METEORA]: "Meteora's protocol fee on bonding-curve swaps.",
    [LABELS.CURVE_FEES_TO_REFERRALS]: "The part of Meteora's protocol fee paid to the referrer of a bonding-curve swap, when the swap names one.",
    [LABELS.POOL_FEES_TO_LPS]: "LP fees in graduated DAMM v2 pools earned by liquidity other than Nyraa's: mainly the creator's locked position.",
    [LABELS.POOL_FEES_TO_METEORA]: "Meteora's protocol fee on swaps in graduated DAMM v2 pools.",
    [LABELS.POOL_FEES_TO_REFERRALS]: "The part of Meteora's protocol fee paid to the referrer of a graduated-pool swap, when the swap names one.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-10-28", // Nyraa's config was created on 2026-10-28 07:39 UTC, its first coin the same day
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  doublecounted: true, // Nyraa coins trade on Meteora DBC curves and DAMM v2 pools, also counted on Meteora's listings
  methodology,
  breakdownMethodology,
};

export default adapter;

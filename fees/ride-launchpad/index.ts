import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { timeFilter, u64, u8 } from "../../helpers/alliumSolanaEvents";
import { base58Decode, base58Encode, findProgramAddress, getAccountBuffers, getProgramAccounts, solanaRpc } from "../../helpers/solana";

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
    if (!data) throw new Error(`ride-launchpad: DAMM pool ${pool} not found`);
    if (base58Encode(data.subarray(200, 232)) !== ADDRESSES.solana.USDC) throw new Error(`ride-launchpad: DAMM pool ${pool} is not quoted in USDC`);
    // 1 = fees only in token B (USDC)
    if (data[484] !== 1) throw new Error(`ride-launchpad: DAMM pool ${pool} collects fees in mode ${data[484]}`);
    if (!rideLiquidity[pool]) throw new Error(`ride-launchpad: no Ride position found in DAMM pool ${pool}`);
    pools[pool] = { rideLiquidity: rideLiquidity[pool], sqrtMinPrice: u128(data, 424) };
  });
  return pools;
};

// Swap fees in USDC (raw units). DBC: `trading_fee` is the swap fee after Meteora's protocol and referral cut, split
// between the coin's creator (the config's creator_trading_fee_percentage) and Ride as the partner.
// DAMM v2: `claiming_fee` is the swap fee paid to the pool's LPs, shared by liquidity, so Ride's part is its
// liquidity over the pool's. The pool's liquidity is not in the event; its full-range reserve gives it exactly:
// reserve_b = liquidity * (sqrt_price - sqrt_min_price) >> 128.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // DBC PoolConfig (idls/dynamic_bonding_curve.json): fee_claimer at 40, creator_trading_fee_percentage at 245.
  // The config is immutable, so its current values apply to every past swap.
  const [config] = await getAccountBuffers({ chain: "solana", accounts: [DBC_CONFIG] });
  if (!config) throw new Error(`ride-launchpad: DBC config ${DBC_CONFIG} not found`);
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
  if (!check) throw new Error("ride-launchpad: empty Allium response");
  if (!check.indexed) throw new Error(`ride-launchpad: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(check.unknown_layout) > 0) throw new Error(`ride-launchpad: ${check.unknown_layout} Meteora swap events with an unknown layout, the program was likely upgraded`);
  if (Number(check.unpaired_txs) > 0) throw new Error(`ride-launchpad: DBC swaps in ${check.unpaired_tx} (and ${Number(check.unpaired_txs) - 1} others) do not emit one EvtSwap3 per EvtSwap2`);

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
    if (reserve === 0n) throw new Error(`ride-launchpad: DAMM swap with an empty USDC reserve in pool ${row.pool}`);
    ammFees += fee;
    // fee * rideLiquidity / poolLiquidity, with poolLiquidity = (reserve << 128) / (sqrtPrice - sqrtMinPrice)
    ammRideFees += (fee * rideLiquidity * (sqrtPrice - sqrtMinPrice)) / (reserve << 128n);
  });
  const curveCreatorFees = (curveFees * creatorPercentage) / 100n;

  const usdc = ADDRESSES.solana.USDC;
  dailyFees.add(usdc, curveFees.toString(), "Launchpad Bonding Curve Fees");
  dailyFees.add(usdc, ammFees.toString(), "Launchpad AMM Fees");
  dailyRevenue.add(usdc, (curveFees - curveCreatorFees).toString(), "Launchpad Bonding Curve Fees To Protocol");
  dailyRevenue.add(usdc, ammRideFees.toString(), "Launchpad AMM Fees To Protocol");
  dailySupplySideRevenue.add(usdc, curveCreatorFees.toString(), "Launchpad Bonding Curve Fees To Creators");
  dailySupplySideRevenue.add(usdc, (ammFees - ammRideFees).toString(), "Launchpad AMM Fees To Other LPs");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Trading fees paid in USDC on coins launched through the Ride Launchpad, while they trade on their bonding curve and after they graduate to an AMM pool.",
  Revenue: "Ride's share of the trading fees on coins launched through the Ride Launchpad: its cut of bonding curve fees and the AMM fees earned by its locked liquidity.",
  ProtocolRevenue: "Ride's share of the trading fees on coins launched through the Ride Launchpad, kept by the protocol.",
  SupplySideRevenue: "Trading fees on coins launched through the Ride Launchpad that are paid to the coins' creators and to the other liquidity providers in their AMM pools.",
};

const breakdownMethodology = {
  Fees: {
    "Launchpad Bonding Curve Fees": "Trading fees on coins launched through the Ride Launchpad while they trade on their bonding curve.",
    "Launchpad AMM Fees": "Trading fees on launched coins after they graduate to an AMM pool.",
  },
  Revenue: {
    "Launchpad Bonding Curve Fees To Protocol": "Ride's share of bonding curve trading fees.",
    "Launchpad AMM Fees To Protocol": "Ride's share of AMM trading fees.",
  },
  ProtocolRevenue: {
    "Launchpad Bonding Curve Fees To Protocol": "Ride's share of bonding curve trading fees.",
    "Launchpad AMM Fees To Protocol": "Ride's share of AMM trading fees.",
  },
  SupplySideRevenue: {
    "Launchpad Bonding Curve Fees To Creators": "The creators' share of bonding curve trading fees, shared with the coin's vault and stakers.",
    "Launchpad AMM Fees To Other LPs": "The share of AMM trading fees earned by the coin's other liquidity providers, mainly its own creator position, which is shared with the coin's vault and stakers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  // first launchpad program tx 2026-10-27 14:43 UTC, DBC config created 14:54 UTC
  start: "2026-10-27",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;

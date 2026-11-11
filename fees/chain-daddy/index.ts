import { AbiCoder, keccak256, solidityPackedKeccak256 } from "ethers";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";
import { timeFilter, u64 } from "../../helpers/alliumSolanaEvents";
import { getCache, setCache } from "../../helpers/cache";
import { toPositionedLogArgs } from "../../helpers/logs";
import { base58Decode, base58Encode, getProgramAccounts } from "../../helpers/solana";

// Chain Daddy (https://chaindaddy.io) is a launchpad and token-page registry. Its launchpad creates every coin's pool
// through Doppler on EVM chains and through Meteora's Dynamic Bonding Curve (DBC) on Solana, and Chain Daddy is
// written into each pool as a fee beneficiary at creation. Its pools are found by that beneficiary entry, so every
// pool counted here names Chain Daddy's own treasury on-chain.

// ---------------------------------------------------------------- EVM (Doppler)

// Chain Daddy's operator Safe, the protocol fee beneficiary of every launch pool. It is the same Safe on every chain:
// https://basescan.org/address/0xd9Ff2F35Ede50cC1101EBDa5e40De4Fb54a318A7
const CHAIN_DADDY_SAFE = "0xd9ff2f35ede50cc1101ebda5e40de4fb54a318a7";

// Doppler's Airlock requires its owner to hold at least 5% of every pool's LP fee (storeBeneficiaries with
// airlock.owner(), MIN_PROTOCOL_OWNER_SHARES). These are the addresses that have owned the Airlocks below, read from
// the Airlocks' OwnershipTransferred events:
// - 0x21E2ce70…: owner of the Base Airlock since block 28415528 and of the Robinhood Airlock since block 17528160
// - 0xEDeAa06E…: first owner of the Robinhood Airlock 0xeb7C0347… (blocks 646829 to 17528160)
// - 0xaCE07c3c…: first owner of the Base Airlock 0x660eAaEd… (blocks 28415516 to 28415528)
const DOPPLER_OWNERS = new Set([
  "0x21e2ce70511e4fe542a97708e89520471daa7a66",
  "0xedeaa06e2eb42a5c19ce27c6cffb36fd4fe1eda8",
  "0xace07c3c1d3b556d42633211f0da71dc6f6d1c42",
]);

// Both Doppler pool initializers Chain Daddy launches through emit the same event when they write a pool's fee
// beneficiaries: DopplerHookInitializer (multicurve Uniswap v4 pools, every Chain Daddy pool so far) keys it by the
// launched token, LockableUniswapV3Initializer (static Uniswap v3 pools) by the pool.
// https://github.com/whetstoneresearch/doppler/blob/main/src/initializers/LockableUniswapV3Initializer.sol
// https://github.com/whetstoneresearch/doppler/blob/main/src/initializers/DopplerHookInitializer.sol
const LOCK_EVENT = "event Lock(address indexed pool, (address beneficiary, uint96 shares)[] beneficiaries)";
const V4_SWAP_EVENT = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const V4_SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const MULTICURVE_STATE_ABI = "function getState(address asset) view returns (address numeraire, uint256 totalTokensOnBondingCurve, address dopplerHook, bytes graduationDopplerHookCalldata, uint8 status, (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, int24 farTick)";
// Uniswap v4 PoolManager: a pool's slot0 is the first word of _pools[poolId], and _pools sits in storage slot 6
// (StateLibrary.POOLS_SLOT). Bits 184-207 of that word are the pool's Uniswap protocol fee.
const EXTSLOAD_ABI = "function extsload(bytes32 slot) view returns (bytes32)";
// LockableUniswapV3Initializer (static launches, Chain Daddy's default launch mode): the pool's launched asset and
// numeraire, and the Uniswap v3 pool's own swap event, fee tier and protocol fee.
const LOCKABLE_V3_STATE_ABI = "function getState(address pool) view returns (address asset, address numeraire, int24 tickLower, int24 tickUpper, uint256 maxShareToBeSold, uint256 totalTokensOnBondingCurve, uint8 status)";
const V3_SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const V3_SLOT0_ABI = "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";
const V4_POOLS_SLOT = 6;

type EvmConfig = {
  start: string;
  // block of the first Lock event that names Chain Daddy on this chain
  fromBlock: number;
  // blocks of Lock events read per request while the pool cache catches up (see getChainDaddyPools)
  lockScanBlocks: number;
  poolManager: string;
  multicurveInitializers: string[];
  // LockableUniswapV3Initializer: static launches, a permanently locked Uniswap v3 pool
  v3Initializers: string[];
};

// One entry per chain: its start, and on EVM chains the Doppler deployments, from the Doppler SDK address book
// (@whetstone-research/doppler-sdk getAddresses).
const chainConfig: Record<string, EvmConfig | { start: string }> = {
  [CHAIN.BASE]: {
    // first pool: tx 0x2e757d1c6fe72006ed80c95bd81f3d4862b1738b46fffd15f10be99c42f3bc66 (2026-09-24)
    start: "2026-09-24",
    fromBlock: 51711224,
    // ~432k blocks and ~25k Lock events a day (2026-11-10)
    lockScanBlocks: 500_000,
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    multicurveInitializers: ["0xBDF938149ac6a781F94FAa0ed45E6A0e984c6544"],
    v3Initializers: ["0xD09dEd1867d885fcDB41ADC957165D04aE917683"],
  },
  [CHAIN.ROBINHOOD]: {
    // first pool: token 0x4fd711D257DF22e8114b46fA37248399Ff07619a, Lock in block 14962411 (2026-07-20)
    start: "2026-07-20",
    fromBlock: 14962411,
    // ~822k blocks and ~630 Lock events a day (2026-11-10)
    lockScanBlocks: 10_000_000,
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    multicurveInitializers: ["0x4e3468951D49f2EEa976eD0D6e75fFCb44a9a544"],
    v3Initializers: ["0xD09dEd1867d885fcDB41ADC957165D04aE917683"],
  },
  // Ethereum, Arbitrum and BNB Chain are also open for launches, but no pool names Chain Daddy there yet
  // (Lock events scanned on all three on 2026-11-09). They are added once one does.
  // Not counted: Doppler dynamic-auction pools before they graduate. Chain Daddy holds no share in them and no event
  // names it until the migrator locks the graduated pool (two exist on Base, neither has graduated).
  // first swap on a Chain Daddy DBC pool: 2026-08-18 (pool ARMJAyTVDi9zZwvBPvi11ycciR49n9HvfyUsXtThZxN9)
  [CHAIN.SOLANA]: { start: "2026-08-18" },
};

type Shares = { chainDaddy: bigint; doppler: bigint; creators: bigint };

const WAD = 10n ** 18n;
const PIPS = 1_000_000n;
const abs = (x: bigint) => (x < 0n ? -x : x);

// the pool's fee split, as written into its beneficiary set at creation
const splitShares = (beneficiaries: any[]): Shares | undefined => {
  let chainDaddy = 0n;
  let doppler = 0n;
  let total = 0n;
  for (const { beneficiary, shares } of beneficiaries) {
    const s = BigInt(shares);
    total += s;
    const who = beneficiary.toLowerCase();
    if (who === CHAIN_DADDY_SAFE) chainDaddy += s;
    else if (DOPPLER_OWNERS.has(who)) doppler += s;
  }
  if (chainDaddy === 0n) return undefined;
  if (total !== WAD) throw new Error(`chain-daddy: beneficiary shares sum to ${total}, not 1e18`);
  return { chainDaddy, doppler, creators: WAD - chainDaddy - doppler };
};

const addLpFee = (balances: any, token: string, lpFee: bigint, shares: Shares) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = balances;
  const toChainDaddy = (lpFee * shares.chainDaddy) / WAD;
  const toDoppler = (lpFee * shares.doppler) / WAD;
  dailyFees.add(token, lpFee, "Launch Pool LP Fees");
  dailyRevenue.add(token, toChainDaddy, "Launch Pool LP Fees To Chain Daddy");
  dailySupplySideRevenue.add(token, toDoppler, "Launch Pool LP Fees To Doppler");
  dailySupplySideRevenue.add(token, lpFee - toChainDaddy - toDoppler, "Launch Pool LP Fees To Creators");
};

type Pool = { pool: string; initializer: string; shares: Shares };
// a pool as kept in the cache: shares as decimal strings, and the block of its Lock event
type CachedPool = { pool: string; initializer: string; block: number; chainDaddy: string; doppler: string; creators: string };
type PoolCache = { lastBlock?: number; pools?: CachedPool[] };

const POOL_CACHE = "chain-daddy-pools";
const poolCaches: Record<string, Promise<PoolCache>> = {};
const poolSyncs: Record<string, Promise<unknown>> = {};

// Every pool Chain Daddy is a beneficiary of, from the Lock events up to toBlock. Doppler's initializers are shared by
// every launchpad built on Doppler (379,535 Lock events on Base's multicurve initializer by 2026-11-11, 2 of them
// Chain Daddy's), and the beneficiaries are not indexed, so the query cannot be narrowed to Chain Daddy and a full scan
// on each run is too slow. Chain Daddy's pools are kept in the adapter cache with the last block scanned: a run reads
// only the blocks after it, lockScanBlocks at a time, saving after each, so an interrupted catch-up resumes.
const getChainDaddyPools = (options: FetchOptions, config: EvmConfig, toBlock: number): Promise<Pool[]> => {
  // syncs of one chain run one after another, so concurrent windows never read the same blocks twice
  const run = (poolSyncs[options.chain] ?? Promise.resolve()).then(() => syncPools(options, config, toBlock));
  poolSyncs[options.chain] = run.catch(() => undefined);
  return run;
};

const syncPools = async (options: FetchOptions, config: EvmConfig, toBlock: number): Promise<Pool[]> => {
  if (!poolCaches[options.chain]) poolCaches[options.chain] = getCache(POOL_CACHE, options.chain);
  const cache = await poolCaches[options.chain];
  if (!cache.pools || cache.lastBlock === undefined) {
    cache.pools = [];
    cache.lastBlock = config.fromBlock - 1;
  }
  const pools = cache.pools;
  const initializers = [...config.multicurveInitializers, ...config.v3Initializers].map((a) => a.toLowerCase());
  while (cache.lastBlock < toBlock) {
    const fromBlock = cache.lastBlock + 1;
    const scanTo = Math.min(cache.lastBlock + config.lockScanBlocks, toBlock);
    // flatten: false keeps the logs per initializer, so each pool's state is read from the initializer that holds it
    const locksByInitializer = await options.getLogs({ targets: initializers, eventAbi: LOCK_EVENT, fromBlock, toBlock: scanTo, flatten: false, onlyArgs: false });
    locksByInitializer.forEach((locks: any[], i: number) => locks.forEach((log: any) => {
      const lock = toPositionedLogArgs(log);
      const shares = splitShares(lock.beneficiaries);
      if (!shares) return;
      pools.push({
        pool: lock.pool.toLowerCase(),
        initializer: initializers[i],
        block: lock.blockNumber,
        chainDaddy: shares.chainDaddy.toString(),
        doppler: shares.doppler.toString(),
        creators: shares.creators.toString(),
      });
    }));
    cache.lastBlock = scanTo;
    await setCache(POOL_CACHE, options.chain, cache);
  }
  // a refill of an earlier window skips pools created after it
  return pools
    .filter((p) => p.block <= toBlock)
    .map((p) => ({ pool: p.pool, initializer: p.initializer, shares: { chainDaddy: BigInt(p.chainDaddy), doppler: BigInt(p.doppler), creators: BigInt(p.creators) } }));
};

const fetchEvm = async (options: FetchOptions, balances: any) => {
  const config = chainConfig[options.chain] as EvmConfig;
  const toBlock = await options.getToBlock();

  const pools = await getChainDaddyPools(options, config, toBlock);
  const isIn = (initializers: string[]) => (p: Pool) => initializers.some((a) => a.toLowerCase() === p.initializer);
  const v4Pools = pools.filter(isIn(config.multicurveInitializers));
  const v3Pools = pools.filter(isIn(config.v3Initializers));

  // ---- multicurve pools (Uniswap v4): the LP fee is in every Swap event. Only the initializer has ever added liquidity
  // to these pools (PoolManager ModifyLiquidity, checked 2026-11-09), so the whole LP fee goes to the beneficiaries.
  if (v4Pools.length) {
    // the multicurve initializer keys a pool by its launched token (Lock's `pool`)
    const states = await options.api.multiCall({ abi: MULTICURVE_STATE_ABI, calls: v4Pools.map((p) => ({ target: p.initializer, params: [p.pool] })) });
    const coder = AbiCoder.defaultAbiCoder();
    const pools: Record<string, { numeraire: string; numeraireIs0: boolean; shares: Shares }> = {};
    v4Pools.forEach((p, i) => {
      const state = states[i];
      const key = state.poolKey;
      const poolId = keccak256(coder.encode(["address", "address", "uint24", "int24", "address"], [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks])).toLowerCase();
      pools[poolId] = { numeraire: state.numeraire, numeraireIs0: state.numeraire.toLowerCase() === key.currency0.toLowerCase(), shares: p.shares };
    });
    const poolIds = Object.keys(pools);

    // Uniswap's own protocol fee per pool, at the end of the window, where every pool counted exists (0 on every pool so far)
    const slot0s = await options.api.multiCall({
      abi: EXTSLOAD_ABI,
      calls: poolIds.map((id) => ({ target: config.poolManager, params: [solidityPackedKeccak256(["bytes32", "uint256"], [id, V4_POOLS_SLOT])] })),
    });
    const protocolFees: Record<string, bigint> = {};
    poolIds.forEach((id, i) => { protocolFees[id] = (BigInt(slot0s[i]) >> 184n) & 0xffffffn; });

    // One query for every pool, filtered on the indexed poolId (OR'd in topic1): the PoolManager carries every v4 swap
    // on the chain.
    const swaps = await options.getLogs({ target: config.poolManager, eventAbi: V4_SWAP_EVENT, topics: [V4_SWAP_TOPIC, poolIds] as any });
    for (const swap of swaps) {
      const id = swap.id.toLowerCase();
      const pool = pools[id];
      if (!pool) throw new Error(`chain-daddy: Swap of unrequested v4 pool ${id}`);
      const amount0 = BigInt(swap.amount0);
      // the fee is measured on the numeraire side of each swap, as the uniswap-v4 adapter does
      const volume = abs(pool.numeraireIs0 ? amount0 : BigInt(swap.amount1));
      const swapFee = (volume * BigInt(swap.fee)) / PIPS;
      // a negative amount0 is token0 paid in: zeroForOne. The low 12 bits are that direction's protocol fee.
      const protocolFeeRate = amount0 < 0n ? protocolFees[id] & 0xfffn : protocolFees[id] >> 12n;
      const lpFee = swapFee - (volume * protocolFeeRate) / PIPS;
      addLpFee(balances, pool.numeraire, lpFee, pool.shares);
    }
  }

  // ---- static pools (Uniswap v3), Chain Daddy's default launch mode: the initializer keys the pool by the v3 pool
  // itself, whose liquidity it adds and locks. The first one naming Chain Daddy is 0x307a19f8… on Base (block 55751452,
  // 2026-11-10).
  if (v3Pools.length) {
    const v3PoolAddresses = v3Pools.map((p) => p.pool);
    const [states, token0s, feeTiers, slot0s, swapsByPool] = await Promise.all([
      options.api.multiCall({ abi: LOCKABLE_V3_STATE_ABI, calls: v3Pools.map((p) => ({ target: p.initializer, params: [p.pool] })) }),
      options.api.multiCall({ abi: "address:token0", calls: v3PoolAddresses }),
      options.api.multiCall({ abi: "uint24:fee", calls: v3PoolAddresses }),
      // read at the end of the window: a pool created inside it has no code at the window's first block
      options.api.multiCall({ abi: V3_SLOT0_ABI, calls: v3PoolAddresses }),
      // flatten: false keeps the swaps per pool, in the order of v3Pools
      options.getLogs({ targets: v3PoolAddresses, eventAbi: V3_SWAP_EVENT, flatten: false }),
    ]);
    for (let i = 0; i < v3Pools.length; i++) {
      const numeraire = states[i].numeraire;
      const numeraireIs0 = numeraire.toLowerCase() === token0s[i].toLowerCase();
      const feeTier = BigInt(feeTiers[i]);
      // v3's protocol fee is 1/n of the swap fee on the token paid in: n in the low 4 bits for token0, the high 4 for token1
      const feeProtocol = Number(slot0s[i].feeProtocol);
      for (const swap of swapsByPool[i]) {
        const amount0 = BigInt(swap.amount0);
        // measured on the numeraire side of each swap, as for the v4 pools above
        const volume = abs(numeraireIs0 ? amount0 : BigInt(swap.amount1));
        const swapFee = (volume * feeTier) / PIPS;
        // a positive amount0 is token0 paid in
        const denominator = BigInt(amount0 > 0n ? feeProtocol & 0xf : feeProtocol >> 4);
        const lpFee = denominator > 0n ? swapFee - swapFee / denominator : swapFee;
        addLpFee(balances, numeraire, lpFee, v3Pools[i].shares);
      }
    }
  }
};

// ---------------------------------------------------------------- Solana (Meteora DBC)

// https://solscan.io/account/dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
const DBC_PROGRAM = "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN";
// Chain Daddy's DBC configs are found by their fee claimer, the partner that receives Chain Daddy's cut:
// - 3yDtfaKy…: Chain Daddy's operator Squads vault, fee claimer of every config created since 2026-09-03
// - 9Q76sLRA…: the Squads vault that created the first two configs (DTaant9v…, 276Tvd1T…) and stays their fee
//   claimer, since DBC configs cannot be updated
const DBC_FEE_CLAIMERS = [
  "3yDtfaKyoaCaSf4V5VEfA61xWQNcKjR4WGysdJ4osxzh",
  "9Q76sLRA4VcdBT6ePU7Rvo7wpK8KV7wCuhi3c4vzDmp9",
];
// PoolConfig (programs/dynamic-bonding-curve/src/state/config.rs), after the 8-byte discriminator: quote_mint at 8,
// fee_claimer at 40, collect_fee_mode at 232, creator_trading_fee_percentage at 245
const DBC_CONFIG_SIZE = 1048;
// Meteora emits events as self-CPIs (emit_cpi!): an 8-byte tag, the 8-byte event discriminator, then the Borsh body.
// Every DBC swap emits EvtSwap2; newer program versions also emit EvtSwap and EvtSwap3 for the same trade, so only
// EvtSwap2 is counted. EvtSwap2 (programs/dynamic-bonding-curve/src/event.rs): pool at 16, config at 48, then
// trade_direction, has_referral, SwapParameters2 (17 bytes) and SwapResult2, whose trading_fee is at 147.
const EVENT_CPI_TAG = "e445a52e51cb9a1d";
const EVT_SWAP2 = "bd4233a826507599";
const EVT_SWAP2_LENGTH = 195;

const fetchSolana = async (options: FetchOptions, balances: any) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = balances;
  const configs: any[] = (await Promise.all(DBC_FEE_CLAIMERS.map((claimer) => getProgramAccounts({
    programId: DBC_PROGRAM,
    encoding: "base64",
    filters: [{ dataSize: DBC_CONFIG_SIZE }, { memcmp: { offset: 40, bytes: claimer } }],
  })))).flat();
  if (!configs.length) throw new Error("chain-daddy: no DBC configs found for Chain Daddy's fee claimers");

  // keyed by the config's hex pubkey, which is how EvtSwap2 carries it
  const configsByHex: Record<string, { pubkey: string; quoteMint: string; creatorPercentage: bigint }> = {};
  for (const { pubkey, account } of configs) {
    const data = Buffer.from(account.data[0], "base64");
    // collect_fee_mode 0: the fee is always taken in the quote token
    if (data.readUInt8(232) !== 0) throw new Error(`chain-daddy: DBC config ${pubkey} does not collect fees in the quote token`);
    configsByHex[Buffer.from(base58Decode(pubkey)).toString("hex")] = {
      pubkey,
      quoteMint: base58Encode(data.subarray(8, 40)),
      creatorPercentage: BigInt(data.readUInt8(245)),
    };
  }
  const configHexes = Object.keys(configsByHex).map((hex) => `'${hex}'`).join(", ");

  // Every DBC EvtSwap2 in the window, read from the program's event self-CPIs. The layout check runs on all of them,
  // before the config filter: an upgraded layout could move the config field and silently drop every match.
  // The sum is returned as text so it reaches BigInt exactly.
  const rows = await queryAllium(`
    WITH events AS (
      SELECT SUBSTR(data_hex, 97, 64) AS config, LENGTH(data_hex) / 2 AS len, data_hex
      FROM solana.raw.inner_instructions
      WHERE program_id = '${DBC_PROGRAM}'
        AND parent_tx_success
        AND ${timeFilter(options)}
        AND LEFT(data_hex, 32) = '${EVENT_CPI_TAG}${EVT_SWAP2}'
    ),
    checks AS (
      SELECT
        (SELECT COUNT_IF(len <> ${EVT_SWAP2_LENGTH}) FROM events) AS unknown_layout,
        -- the transfers table is built from the raw ones, so rows past the window mean the window is complete
        EXISTS (SELECT 1 FROM solana.assets.transfers
          WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 900})) AS indexed
    )
    SELECT 'check' AS kind, unknown_layout, indexed, NULL AS config, NULL AS fee
    FROM checks
    UNION ALL
    SELECT 'fee', NULL, NULL, config, TO_VARCHAR(SUM(${u64("data_hex", 147)}))
    FROM events
    WHERE config IN (${configHexes}) AND len = ${EVT_SWAP2_LENGTH}
    GROUP BY config
  `);

  const check = rows.find((row: any) => String(row.kind).toLowerCase() === "check");
  if (!check) throw new Error("chain-daddy: empty Allium response");
  if (!check.indexed) throw new Error(`chain-daddy: Allium has not indexed Solana past ${new Date(options.endTimestamp * 1e3).toISOString()} yet`);
  if (Number(check.unknown_layout) > 0) throw new Error(`chain-daddy: ${check.unknown_layout} DBC EvtSwap2 events with an unknown layout, the DBC program was likely upgraded`);

  for (const row of rows) {
    if (String(row.kind).toLowerCase() !== "fee") continue;
    const config = configsByHex[String(row.config).toLowerCase()];
    if (!config) throw new Error(`chain-daddy: Allium returned fees for unknown DBC config ${row.config}`);
    const tradingFees = BigInt(row.fee);
    const toCreators = (tradingFees * config.creatorPercentage) / 100n;
    dailyFees.add(config.quoteMint, tradingFees, "Bonding Curve Trading Fees");
    dailyRevenue.add(config.quoteMint, tradingFees - toCreators, "Bonding Curve Trading Fees To Chain Daddy");
    dailySupplySideRevenue.add(config.quoteMint, toCreators, "Bonding Curve Trading Fees To Creators");
  }
};

const fetch = async (options: FetchOptions) => {
  const balances = {
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  };
  if (options.chain === CHAIN.SOLANA) await fetchSolana(options, balances);
  else await fetchEvm(options, balances);

  return {
    ...balances,
    dailyProtocolRevenue: balances.dailyRevenue.clone(),
  };
};

const methodology = {
  Fees: "Trading fees paid by traders in pools created by Chain Daddy's launchpad: the LP fee of the Uniswap pools it creates through Doppler on EVM chains (a locked Uniswap v3 pool for a default launch, a Uniswap v4 pool for its other launch modes), and the trading fee of its Meteora Dynamic Bonding Curve pools on Solana after Meteora's protocol and referral fees. Excludes the separate hook fee of Doppler Rehype pools, which goes wholly to each coin's own fee address, a burn or its holders, Uniswap's protocol fee where it is switched on, and Chain Daddy's token page and token creation fees, which are paid by card or as plain transfers.",
  Revenue: "Chain Daddy's share of the trading fees in its launchpad pools, fixed in each pool when it launches: 20% of the LP fee for EVM pools launched since 2026-10-10 (earlier pools carry 5%, 15% or 20%), and 20% of the Solana bonding curve trading fee for pools launched since 2026-10-10 (earlier configs 5% or 15%).",
  ProtocolRevenue: "Chain Daddy's share of the trading fees in its launchpad pools, accrued to Chain Daddy's treasury.",
  SupplySideRevenue: "Trading fees in Chain Daddy's launchpad pools that go to each coin's creator (75% of the LP fee for EVM pools launched since 2026-10-10, 80% of the Solana trading fee) and to Doppler (5% of the LP fee on EVM pools).",
};

const breakdownMethodology = {
  Fees: {
    "Launch Pool LP Fees": "Uniswap LP fee paid by traders in Chain Daddy's Doppler launch pools on EVM chains, measured on the numeraire side of each swap.",
    "Bonding Curve Trading Fees": "Trading fee paid by traders in Chain Daddy's Meteora Dynamic Bonding Curve pools on Solana, after Meteora's protocol and referral fees.",
  },
  Revenue: {
    "Launch Pool LP Fees To Chain Daddy": "Chain Daddy's beneficiary share of the LP fee, read from each pool's beneficiary set.",
    "Bonding Curve Trading Fees To Chain Daddy": "Chain Daddy's partner share of the bonding curve trading fee, read from each pool's DBC config.",
  },
  ProtocolRevenue: {
    "Launch Pool LP Fees To Chain Daddy": "Chain Daddy's beneficiary share of the LP fee, held by its operator Safe.",
    "Bonding Curve Trading Fees To Chain Daddy": "Chain Daddy's partner share of the bonding curve trading fee, held by its Squads vault.",
  },
  SupplySideRevenue: {
    "Launch Pool LP Fees To Creators": "The coin creator's beneficiary share of the LP fee (including any co-creators the launch named).",
    "Launch Pool LP Fees To Doppler": "The Doppler Airlock owner's mandatory beneficiary share of the LP fee (5%).",
    "Bonding Curve Trading Fees To Creators": "The coin creator's share of the bonding curve trading fee, read from each pool's DBC config.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
  // every fee here is a swap fee on a Uniswap or Meteora pool, which those listings already count
  doublecounted: true,
};

export default adapter;

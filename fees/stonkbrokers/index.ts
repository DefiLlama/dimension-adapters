import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";

/**
 * StonkBrokers — Anvil NFTFi + Broker Box + Safety Deposit Box on Robinhood,
 * plus the Relay swap-desk fee rail on Base.
 *
 * Fee sources:
 * 1. NFT AMM trades + NFT-backed loans (70% StockBooster / 30% ProtocolFeeSink)
 * 2. Broker activation fees in $STONKBROKER (50% burn / 50% protocol)
 * 3. Broker Box gachapon edge (10% of ticket: 5% StockBooster+creator / 5% protocol)
 *    plus Certificate Counter flat $2 fee ($1 StockBooster / $1 treasury)
 * 4. Safety Deposit Box liquidity-locker protocol cuts (Uniswap V3 + V4 and
 *    up. DEX v2 + CL lockers) → SafetyDepositClockInV3 (90% brokers / 10%
 *    protocol wallet)
 * 5. Swap-desk 1% Relay app fee: Base USDC forwarded from the fee wallet
 *    (claimed from Relay, then bridged to StockBooster as ETH)
 * 6. Anti-snipe fair-launch tooling: time-decay snipe tax on launch-curve
 *    buys (starts at 99% and falls 1%/minute over a 99-minute window), split
 *    90% StockBooster / 10% launch dev, pushed live per trade. First
 *    production launch: Card Wall ($WALL), 2026-08-14 — raise bonded into
 *    permanently locked LP, so the tax is the only extractable fee leg.
 * 7. Safe Launch / Stonklauncher pads (public go-live 2026-08-17, V2 live
 *    2026-08-21/22, r2/"v3" pad generation 2026-08-23): every window buy/sell
 *    pays the decaying snipe tax, split 16.5% launch creator / 16.5% protocol
 *    accrual / 50% locked-LP reserve (or ICO Bonus kickstarter on degen modes)
 *    / 17% StockBooster via the Clock In Card (~0.5% of tax to the referrer).
 *    Covers the V1 ETH pad, all V1 quoted lanes, all V2 lanes, and all r2
 *    lanes. Quoted-lane amounts are denominated in the lane's quote token
 *    (STONK / USDG / WETH / tokenized stocks), not native ETH.
 * 8. Stonk Launcher bonding-curve factory (closed; residual trading): 1%
 *    trade fee on StonkCurvePool, waterfall 33/33/33 creator / protocol /
 *    StonkBrokers (Directed Clock In + jackpot pot).
 * 9. Token vesting locker (StonkVestingLocker): 0.01% (1 bps) deposit fee.
 *
 * Volume (protocol volume chart — same dailyVolume feeds the dexs/stonkbrokers listing):
 * - NFT AMM notional (ethFeePaid ÷ fee bps)
 * - Broker Box ticket notional (PullOpened.ticketWei)
 * - Certificate Counter stock purchase (CertificateBought.spendWei)
 * - Broker Box sell-backs (SoldBack ethOut + SoldBackUsdg usdgOut)
 * - Anti-snipe launch buys (WallBought.ethIn)
 * - Safe Launch / Stonklauncher window buys AND sells on every pad generation
 *   (buy = tax-inclusive quote in; sell = net quote out + tax)
 * - StonkCurvePool Trade.quoteAmount (bonding-curve launcher)
 */

const AMM_VAULT = "0xE302733accF4800146E55fC45B46b4E4fFC032D2";
const LOAN_VAULT = "0xa7B9AC696B252B79568A5a01b2Fd02177EF23664";
const ACTIVATION_MANAGER = "0xacD5ae3c060C1137FE2Ee86B0aB2EF697456f664";
const STONKBROKER = "0xe934e36A439C94017B64a3FecE66AF12099aBF50";

// Broker Box production machines (deployed 2026-07-31) + certificate counter.
const GACHA_MACHINES = [
  "0x8F1836209C42d4F6B6caA782c055eE13F8aC95b0", // GME
  "0xF9bc0777C087Af0fe7214dE8A5360bE6a71D0D44", // AAPL
  "0x2829b754784352dd2BeFfa5Eb26d5B499315b715", // AMZN
  "0xc5e3E9C2a835Ec9319Fd8C1d516fD4323c5758A0", // NVDA
  "0xFF20b4b8E08beAA4064E3ca4CC5a2E40AcaC072f", // GOOGL
  "0xfC253E0062eEf614E20E0726e5f6FF7559c35402", // MSFT
  "0x9d2c3355502be065975ad47EF5A902f02c772504", // SLV
  "0xf58979D35C3F0Ff6A6F7EDd909fE8a95a2894609", // SPCX
  "0x5B1282B6Ad40b3DC294404A2b33FF7657B66c33c", // USO
];
const CERTIFICATE_COUNTER = "0x2599882AaF5C14834562eE59ca7a3D1FFCC229D7";

// Safety Deposit Box lockers → fee router. Uniswap V3/V4 pair live 2026-07-25;
// up. DEX (up33) v2 + Slipstream-CL lockers live 2026-08-11 (same protocol-fee
// semantics, protocol cuts route to the same SafetyDepositClockInV3 box).
const LOCKER_V3 = "0xFc96CF67eCC55bE4AdABc3AecBe6Ad6349f11223";
const LOCKER_V4 = "0x5a28ce098750f73bc9eC142D4bCE464E1A0BBdA6";
const LOCKER_UP_V2 = "0x21797736C25851A6102D196afbA78F978f589017";
const LOCKER_UP_CL = "0xc1AfA59e2aBC1C868C51a1F799a7578EaCfEa076";
// Fee sink (not read on-chain here): SafetyDepositClockInV3
// 0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c — splits locker cuts 90/10.

// Relay swap-desk 1% app fee accrues off-chain, is claimed as Base USDC to the
// treasury fee wallet, then forwarded via Relay to StockBooster as ETH.
const RELAY_FEE_WALLET = "0xb668382cF44038a3E8140E789060F6A809787CDa";
const BASE_USDC = ADDRESSES.base.USDC;

// Anti-snipe fair-launch instances (WallFairLaunch-style time-decay snipe-tax
// curves). Each launch is a standalone one-off contract; append new instances
// here as they go live. boosterFeeBps = 9000 on-chain (90% StockBooster /
// 10% launch dev), read from the deployed instance.
const ANTI_SNIPE_LAUNCHES = [
  "0xEa371F8122630d05352Cf15b608402DB2069bdd6", // Card Wall ($WALL), 2026-08-14
];
const LAUNCH_BOOSTER_BPS = 9000n;

// Safe Launch / Stonklauncher pads. quote=null → native ETH (legacy ETH pad);
// otherwise amounts in SafeBuy/SafeSell are the lane's quote token (field
// names stay ethIn/ethOut on-chain). ClockInCard punches ride the tax split
// — do NOT also read card events (double-count).
const ROBINHOOD_WETH = ADDRESSES.robinhood.WETH;
const QUOTE = {
  WETH: ROBINHOOD_WETH,
  STONK: "0xe934e36A439C94017B64a3FecE66AF12099aBF50",
  USDG: ADDRESSES.robinhood.USDG,
  GME: "0x1b0E319c6A659F002271B69dB8A7df2F911c153E",
  NVDA: "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC",
  AAPL: "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
  SPCX: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa",
  USO: "0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344",
} as const;

type SafePad = { addr: string; quote: string | null; gen: "v1-eth" | "v1-quoted" | "v2" | "r2" };

const SAFE_LAUNCH_PADS: SafePad[] = [
  // V1 ETH pad (native ETH amounts)
  { addr: "0xEcA5726dae1e53365c37fFc02369d947A91d71f9", quote: null, gen: "v1-eth" },
  // V1 quoted lanes (StonkSafeLaunchpadQuoted)
  { addr: "0x77103B69f680BCd3df75F7D7ed3a67030130736a", quote: QUOTE.STONK, gen: "v1-quoted" },
  { addr: "0xa70A17f5522Bb0c701380Df1b0897b4BE5161564", quote: QUOTE.USDG, gen: "v1-quoted" },
  { addr: "0xbAb114C56d12d26e901D0f14B4583Cc0a02537b4", quote: QUOTE.GME, gen: "v1-quoted" },
  { addr: "0x2e512f316751589eB521B7c55Ee9E824ABb80B8E", quote: QUOTE.NVDA, gen: "v1-quoted" },
  { addr: "0xFDEb6d19354ed2eB905bfB9899086A5270302eF3", quote: QUOTE.AAPL, gen: "v1-quoted" },
  { addr: "0xcCfe8A38D0C1ba104E362eDCf85DAda11de2Ae62", quote: QUOTE.SPCX, gen: "v1-quoted" },
  { addr: "0xd31228e555d0759ed627E3249Ab6F7C286b9B8af", quote: QUOTE.USO, gen: "v1-quoted" },
  { addr: "0xABEa69101B2a19347A34339F24cAD8b9523E9c29", quote: QUOTE.WETH, gen: "v1-quoted" },
  // V2 lanes (StonkSafeLaunchpadV2, opened 2026-08-21/22)
  { addr: "0xFCd61B25BbF3AbD6cf0070D6328E351cc30EEC9f", quote: QUOTE.WETH, gen: "v2" },
  { addr: "0x8f6782c5Aa37804d08a9b7bf3984Ff3245Fd6cD4", quote: QUOTE.STONK, gen: "v2" },
  { addr: "0xd4F20033586977A2511f4A2DB4aF7C79a340D70a", quote: QUOTE.USDG, gen: "v2" },
  { addr: "0x4B9Dcd6CCFAeF0f6D23065Dd78E79d5E20ec8cFD", quote: QUOTE.GME, gen: "v2" },
  { addr: "0xEe96d955d5634813374ecE4C74F2C0ff71B1F9fB", quote: QUOTE.NVDA, gen: "v2" },
  { addr: "0xB0453A81Cbf963903409FFF18AD92941e1c7a864", quote: QUOTE.AAPL, gen: "v2" },
  { addr: "0x0c3b4EDED41696eFF0ed70841f132B519d81c947", quote: QUOTE.SPCX, gen: "v2" },
  { addr: "0xDb3C81C841ff88db6cDFbDDB0eE049D162A6053B", quote: QUOTE.USO, gen: "v2" },
  // r2 / "v3" pad generation (abort() C-01 patch, BYO path, 2026-08-23)
  { addr: "0x5BCEefBa6fDf437A7388aDC5c9056c827baca3B3", quote: QUOTE.WETH, gen: "r2" },
  { addr: "0x406fd0B957bb8cF1dd57C78540D009578e971131", quote: QUOTE.STONK, gen: "r2" },
  { addr: "0xF0A06Ac7BBb0cc3049B68c257c3ee27CcEA40eeA", quote: QUOTE.USDG, gen: "r2" },
  { addr: "0x5b21F8a5Ef81586627B4725844aD447325d0992B", quote: QUOTE.GME, gen: "r2" },
  { addr: "0xDf03953DCA8dB733345278A0c5fd2E81fa2A9B54", quote: QUOTE.NVDA, gen: "r2" },
  { addr: "0xc522DfaE0D1a140257702392B665183a6De7657f", quote: QUOTE.AAPL, gen: "r2" },
  { addr: "0xd82da1D8ef59959b170b59147283Ab1F2F1Ca86A", quote: QUOTE.SPCX, gen: "r2" },
  { addr: "0x644b19512052A1b6d38d7B16C6c3Fb1d3F7270D2", quote: QUOTE.USO, gen: "r2" },
];
const SAFE_PAD_TARGETS = SAFE_LAUNCH_PADS.map((p) => p.addr);
// Production tax split, applied by the go-live `setFeeSplit(1650, 1650, 5000)`
// and snapshotted into every launch: creator / protocol / locked-LP reserve,
// remainder (1700) punches through the Clock In Card → ~0.5% of tax to the
// referrer, the rest to StockBooster Clock In dividends.
const SAFE_CREATOR_BPS = 1650n;
const SAFE_PROTOCOL_BPS = 1650n;
const SAFE_LP_BPS = 5000n;

// Bonding-curve Stonk Launcher factory (closed; residual curve trading).
const LAUNCHER_FACTORY = "0x80a77001456bc986083678F9a112B1EC2Aa07281";
const LAUNCHER_FACTORY_START = 34_876_725;
const LAUNCHER_CREATOR_BPS = 3333n;
const LAUNCHER_STONK_BPS = 3333n;
// protocol = 10000 - 3333 - 3333 = 3334

// Token vesting locker — 1 bps deposit fee → SafetyDepositClockInV3.
const VESTING_LOCKER = "0x2b4aD79DA7BD3bF340bBd2aD2039b149214e9Aa9";

// Smart LP (Volatility Farming) — immutable concentrated-liquidity vaults on
// canonical Uniswap V3 pools (live 2026-09-08). The on-chain registry is the
// single discovery surface for the fleet (~165 vaults). Every fee collection
// emits FeesCollected on the vault: fees0/fees1 = gross pool fees collected,
// skim0/skim1 = the 10% performance fee, which splits 50% StockBooster
// (Clock In dividends) / 50% $STONKBROKER buybacks. The remaining 90%
// auto-compounds back into the vault position for depositors.
const SMART_LP_REGISTRY = "0xE8749183Fbf6A657EB58B3a4D3E4B9Cc09560146";

const NFT_SOLD =
  "event NFTSold(address indexed seller, uint256 indexed tokenId, uint256 tokensOut, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const NFT_BOUGHT =
  "event NFTBought(address indexed buyer, uint256 indexed tokenId, uint256 tokensIn, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare, bool isSpecific)";
const LOAN_CREATED =
  "event LoanCreated(address indexed borrower, uint256 indexed loanId, uint256 indexed tokenId, uint256 principal, uint256 duration, uint256 ethFeePaid, uint256 boosterShare, uint256 protocolShare)";
const ACTIVATED =
  "event Activated(uint256 indexed tokenId, address indexed owner, uint8 tier, uint256 feePaid)";
const ACTIVATION_UPGRADED =
  "event ActivationUpgraded(uint256 indexed tokenId, address indexed owner, uint8 fromTier, uint8 toTier, uint256 feePaid)";
const EDGE_SKIMMED =
  "event EdgeSkimmed(uint256 indexed roundId, uint256 creatorWei, uint256 boosterWei, uint256 protocolWei)";
const PULL_OPENED =
  "event PullOpened(uint256 indexed roundId, address indexed player, uint8 tier, bool wantCertificate, uint256 ticketWei, uint256 requestId, uint256 stockReserved)";
const SOLD_BACK =
  "event SoldBack(address indexed seller, uint256 stockAmount, uint256 ethOut)";
const SOLD_BACK_USDG =
  "event SoldBackUsdg(address indexed seller, uint256 stockAmount, uint256 usdgOut)";
const CERTIFICATE_BOUGHT =
  "event CertificateBought(uint256 indexed tokenId, address indexed buyer, address indexed recipient, address stockToken, uint256 stockAmount, uint256 spendWei, uint256 feeWei, address wallet)";
const LOCK_FEES_COLLECTED =
  "event LockFeesCollected(uint256 indexed lockTokenId, uint256 userAmount0, uint256 userAmount1, uint256 protocolAmount0, uint256 protocolAmount1)";
// liquidity is uint128 on-chain — wrong width → wrong topic0 and silent misses.
const LOCK_LIQUIDITY_DECREASED =
  "event LockLiquidityDecreased(uint256 indexed lockTokenId, uint128 liquidity, uint256 userAmount0, uint256 userAmount1, uint256 protocolAmount0, uint256 protocolAmount1)";
// up. lockers: gauge-staking payouts move per-token amounts (token0, token1
// and/or the gauge reward token) — the token rides in the event, so no
// lockPositions lookup is needed for these.
const LOCK_TOKENS_PAID =
  "event LockTokensPaid(uint256 indexed lockTokenId, address indexed token, uint256 userAmount, uint256 protocolAmount)";
const WALL_BOUGHT =
  "event WallBought(address indexed buyer, uint256 ethIn, uint256 taxPaid, uint256 taxBps, uint256 tokensOut, uint256 mcapUsd8)";
const SAFE_BUY =
  "event SafeBuy(uint256 indexed id, address indexed buyer, uint256 ethIn, uint256 taxPaid, uint256 taxBps, uint256 tokensOut, uint256 mcapUsd8)";
const SAFE_SELL =
  "event SafeSell(uint256 indexed id, address indexed seller, uint256 tokensIn, uint256 taxPaid, uint256 taxBps, uint256 ethOut, uint256 mcapUsd8)";
const TOKEN_LAUNCHED =
  "event TokenLaunched(address indexed creator, address indexed memeToken, address indexed pool, string name, string symbol, string metadataURI, bytes32 imageHash)";
const CURVE_TRADE =
  "event Trade(address indexed trader, bool indexed isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 feeAmount, uint256 newRealQuote, uint256 newSold)";
const POSITION_LOCKED =
  "event PositionLocked(address indexed token, uint256 indexed lockTokenId, address indexed owner, address vault, uint64 startUnlock, uint64 finishUnlock, uint256 initialAmount, uint256 feeAmount)";
const SMART_LP_FEES_COLLECTED =
  "event FeesCollected(uint256 fees0, uint256 fees1, uint256 skim0, uint256 skim1)";

/** USDG on Robinhood Chain — sell-back rail payout token. */
const ROBINHOOD_USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";

const LABELS = {
  AMM_FEES: "NFT AMM trade fees",
  LOAN_FEES: "NFT loan fees",
  ACTIVATION_FEES: "Broker activation fees ($STONKBROKER)",
  AMM_STOCK_DIVIDENDS: "NFT AMM fees → StockBooster dividends to activated brokers",
  LOAN_STOCK_DIVIDENDS: "NFT loan fees → StockBooster dividends to activated brokers",
  AMM_PROTOCOL_TREASURY: "NFT AMM fees → ProtocolFeeSink",
  LOAN_PROTOCOL_TREASURY: "NFT loan fees → ProtocolFeeSink",
  ACTIVATION_BURN: "Activation fees burned (deflationary $STONKBROKER)",
  ACTIVATION_PROTOCOL: "Activation fees → protocol",
  GACHA_FEES: "Broker Box gachapon edge (10% of ticket)",
  GACHA_STOCK_DIVIDENDS: "Broker Box edge → StockBooster / creator",
  GACHA_PROTOCOL: "Broker Box edge → protocol accrual",
  GACHA_SELLBACK: "Broker Box 5% sell-back spread (retained in bankroll)",
  COUNTER_FEES: "Certificate Counter flat $2 fee",
  COUNTER_STOCK_DIVIDENDS: "Certificate Counter fee → StockBooster",
  COUNTER_PROTOCOL: "Certificate Counter fee → treasury",
  LOCKER_FEES: "Safety Deposit Box liquidity-locker protocol fees",
  LOCKER_STOCK_DIVIDENDS: "Locker fees → SafetyDepositClockIn brokers (90%)",
  LOCKER_PROTOCOL: "Locker fees → protocol wallet (10%)",
  LOCKER_LP_FEES: "Locked-LP trading fees claimed by lock owners (80% creator share)",
  POL_V4_FEES: "Uniswap v4 POL fee income (forever-locked STONK/ETH position → treasury)",
  SWAP_DESK_FEES: "Swap-desk Relay app fees (1%)",
  LAUNCH_TAX: "Anti-snipe launch tax (time-decay snipe tax on curve buys)",
  LAUNCH_TAX_DIVIDENDS: "Anti-snipe launch tax → StockBooster dividends (90%)",
  LAUNCH_TAX_DEV: "Anti-snipe launch tax → launch dev (10%)",
  SAFE_TAX: "Safe Launch / Stonklauncher snipe tax (time-decay tax on window trades)",
  SAFE_TAX_PROTOCOL: "Safe Launch tax → protocol accrual (16.5%)",
  SAFE_TAX_CREATOR: "Safe Launch tax → launch creator (16.5%)",
  SAFE_TAX_BOOSTER: "Safe Launch tax → StockBooster + Clock In Card referrers (17%)",
  SAFE_TAX_LP: "Safe Launch tax → permanently locked LP reserve / ICO Bonus (50%)",
  CURVE_FEES: "Stonk Launcher bonding-curve trade fees (1%)",
  CURVE_PROTOCOL: "Bonding-curve fees → protocol (33.34%)",
  CURVE_CREATOR: "Bonding-curve fees → creator (33.33%)",
  CURVE_STONK: "Bonding-curve fees → StonkBrokers Directed Clock In / pot (33.33%)",
  VESTING_FEES: "Token vesting locker deposit fees (0.01%)",
  SMARTLP_FEES: "Smart LP vault pool fees (Volatility Farming)",
  SMARTLP_COMPOUND: "Smart LP fees auto-compounded to vault depositors (90%)",
  SMARTLP_DIVIDENDS: "Smart LP performance fee → StockBooster Clock In dividends (5%)",
  SMARTLP_BUYBACK: "Smart LP performance fee → $STONKBROKER buybacks (5%)",
};

// Uniswap v4 protocol-owned liquidity: the canonical STONK/ETH 1% pool's
// dominant position (#175704) sits in an ownerless forever-escrow whose sole
// irrevocable fee recipient is the treasury. Principal is locked forever as
// market depth; the fee stream is protocol revenue. Fees are computed from
// the PoolManager's Swap events on that pool, attributed by the escrow
// position's share of the active liquidity carried in each Swap log (the
// position is full-range, so it is always in range).
const UNI_V4_POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const UNI_V4_POSM = "0x58daec3116aae6D93017bAAea7749052E8a04fA7";
const POL_V4_POOL_ID =
  "0xd33c8fd38b06e989cdbd4dffdefab71c4bdd415b24964c8d69e38ff35b068f92";
const POL_V4_POSITION_ID = 175704;
const UNI_V4_SWAP =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const UNI_V4_SWAP_TOPIC0 =
  "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const RANDOM_FEE_BPS = 1000n;
const SPECIFIC_FEE_BPS = 1500n;
const ACTIVATION_BURN_BPS = 5000n;
const ACTIVATION_PROTOCOL_BPS = 5000n;
const LOCKER_PROTOCOL_BPS = 1000n; // SafetyDepositClockInV3 PROTOCOL_BPS
const LOCKER_BROKER_BPS = 9000n;

const ZERO = "0x0000000000000000000000000000000000000000";

type LockerKind = "v3" | "v4" | "upv2" | "upcl";

const LOCK_POSITIONS_ABI: Record<LockerKind, string> = {
  // LockPosition: positionTokenId, lockTokenId, token0, token1, ...
  v3: "function lockPositions(uint256) view returns (uint256 positionTokenId, uint256 lockTokenId, address token0, address token1, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed)",
  // V4Lock: currency0, currency1, fee, tickSpacing, hooks, tickLower, tickUpper, ...
  v4: "function lockPositions(uint256) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks, int24 tickLower, int24 tickUpper, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed)",
  // V2Lock: pool, vault, token0, token1, ...
  upv2: "function lockPositions(uint256) view returns (address pool, address vault, address token0, address token1, uint256 lockTokenId, uint256 initialAmount, uint256 withdrawnAmount, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed, address gauge)",
  // CLLock: positionTokenId, lockTokenId, token0, token1, tickSpacing, ...
  upcl: "function lockPositions(uint256) view returns (uint256 positionTokenId, uint256 lockTokenId, address token0, address token1, int24 tickSpacing, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed, address gauge)",
};

/** Resolve token0/token1 (or currency0/currency1) for a lock, caching per id. */
async function resolveLockTokens(
  options: FetchOptions,
  locker: string,
  lockIds: string[],
  kind: LockerKind,
  cache: Map<string, [string, string]>,
) {
  const missing = lockIds.filter((id) => !cache.has(`${locker}:${id}`));
  if (missing.length === 0) return;

  const rows = await options.api.multiCall({
    abi: LOCK_POSITIONS_ABI[kind],
    calls: missing.map((id) => ({ target: locker, params: [id] })),
    permitFailure: true,
  });
  rows.forEach((row: any, i: number) => {
    if (!row) return;
    const t0 = kind === "v4" ? (row.currency0 || row[0]) : (row.token0 || row[2]);
    const t1 = kind === "v4" ? (row.currency1 || row[1]) : (row.token1 || row[3]);
    cache.set(`${locker}:${missing[i]}`, [
      (t0 || ZERO).toLowerCase(),
      (t1 || ZERO).toLowerCase(),
    ]);
  });
}

function addProtocolCut(
  balances: ReturnType<FetchOptions["createBalances"]>,
  token: string,
  amount: bigint,
  label: string,
) {
  if (amount <= 0n) return;
  if (!token || token === ZERO) balances.addGasToken(amount, label);
  else balances.addToken(token, amount, label);
}

/** Add a Safe Launch quote amount: native ETH when quote is null, else the quote token. */
function addSafeQuote(
  balances: ReturnType<FetchOptions["createBalances"]>,
  quote: string | null,
  amount: bigint,
  label?: string,
) {
  if (amount <= 0n) return;
  if (!quote) {
    if (label) balances.addGasToken(amount, label);
    else balances.addGasToken(amount);
  } else if (label) {
    balances.addToken(quote, amount, label);
  } else {
    balances.addToken(quote, amount);
  }
}

const LOCKER_META: { addr: string; kind: LockerKind }[] = [
  { addr: LOCKER_V3, kind: "v3" },
  { addr: LOCKER_V4, kind: "v4" },
  { addr: LOCKER_UP_V2, kind: "upv2" },
  { addr: LOCKER_UP_CL, kind: "upcl" },
];

const fetchRobinhood = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const [soldLogs, boughtLogs, loansLogs] = await Promise.all([
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_SOLD,}),
    options.getLogs({ target: AMM_VAULT, eventAbi: NFT_BOUGHT,}),
    options.getLogs({ target: LOAN_VAULT, eventAbi: LOAN_CREATED,}),
  ]);

  const [activatedLogs, upgradedLogs, counterLogs] = await Promise.all([
    options.getLogs({ target: ACTIVATION_MANAGER, eventAbi: ACTIVATED,}),
    options.getLogs({
      target: ACTIVATION_MANAGER,
      eventAbi: ACTIVATION_UPGRADED,
    }),
    options.getLogs({
      target: CERTIFICATE_COUNTER,
      eventAbi: CERTIFICATE_BOUGHT,
    }),
  ]);

  const launchBuyLogs = await options.getLogs({
    targets: ANTI_SNIPE_LAUNCHES,
    eventAbi: WALL_BOUGHT,
  });

  const [safeBuyLogsByPad, safeSellLogsByPad] = await Promise.all([
    options.getLogs({
      targets: SAFE_PAD_TARGETS,
      eventAbi: SAFE_BUY,
      flatten: false,
    }),
    options.getLogs({
      targets: SAFE_PAD_TARGETS,
      eventAbi: SAFE_SELL,
      flatten: false,
    }),
  ]);

  // Bonding-curve launcher pools (closed factory — residual trading).
  const launched = await options.getLogs({
    target: LAUNCHER_FACTORY,
    fromBlock: LAUNCHER_FACTORY_START,
    eventAbi: TOKEN_LAUNCHED,
    cacheInCloud: true,
  });
  const curvePools = [
    ...new Set(
      launched
        .map((l: any) => String(l.pool || "").toLowerCase())
        .filter((a: string) => /^0x[0-9a-f]{40}$/.test(a)),
    ),
  ];
  const curveTradeLogs =
    curvePools.length > 0
      ? await options.getLogs({ targets: curvePools, eventAbi: CURVE_TRADE })
      : [];

  const vestingLockedLogs = await options.getLogs({
    target: VESTING_LOCKER,
    eventAbi: POSITION_LOCKED,
  });

  // Smart LP vault fleet — registry-enumerated (the registry is the only
  // discovery surface). flatten:false so each vault's logs attribute to its
  // own token0/token1 pair.
  const smartLpVaults: string[] =
    (await options.api.call({ abi: "address[]:all", target: SMART_LP_REGISTRY }));
  const smartLpFeeLogsByVault: any[][] = smartLpVaults.length
    ? await options.getLogs({
        targets: smartLpVaults,
        eventAbi: SMART_LP_FEES_COLLECTED,
        flatten: false,
      })
    : [];

  // v4 POL: read the escrow position's live liquidity (full-range, so it is
  // always in range), then the pool's Swap tape. Each Swap log carries the
  // pool's active liquidity during that swap — the escrow's fee share of a
  // swap is posLiquidity / swapLiquidity, capped at 1.
  const polV4Liquidity = BigInt(
    (await options.api.call({
      abi: "function getPositionLiquidity(uint256) view returns (uint128)",
      target: UNI_V4_POSM,
      params: [POL_V4_POSITION_ID],
    })),
  );
  const polV4SwapLogs =
    polV4Liquidity > 0n
      ? await options.getLogs({
          target: UNI_V4_POOL_MANAGER,
          eventAbi: UNI_V4_SWAP,
          topics: [UNI_V4_SWAP_TOPIC0, POL_V4_POOL_ID],
        })
      : [];

  const [edgeLogs, pullLogs, soldBackLogs, soldBackUsdgLogs] = await Promise.all([
    options.getLogs({
      targets: GACHA_MACHINES,
      eventAbi: EDGE_SKIMMED,
    }),
    options.getLogs({
      targets: GACHA_MACHINES,
      eventAbi: PULL_OPENED,
    }),
    options.getLogs({
      targets: GACHA_MACHINES,
      eventAbi: SOLD_BACK,
    }),
    options.getLogs({
      targets: GACHA_MACHINES,
      eventAbi: SOLD_BACK_USDG,
    }),
  ]);

  // Robinhood is not in addTokensReceived's log-fallback chain map, so locker
  // cuts are read from the fee events + a lockPositions lookup. Fetched one
  // locker at a time: getLogs defaults to onlyArgs, so multi-target results
  // carry no log.address to attribute the emitting locker with.
  const lockerLogBatches = await Promise.all(
    LOCKER_META.flatMap(({ addr, kind }) => {
      const batches = [
        options.getLogs({ target: addr, eventAbi: LOCK_FEES_COLLECTED })
          .then((logs) => ({ addr, kind, logs })),
      ];
      // LockLiquidityDecreased exists on the position-NFT lockers (V3, V4,
      // up. CL); the up. v2 locker withdraws LP tokens instead (not evented
      // per pair token, so its withdraw cut is not visible here).
      if (kind !== "upv2") {
        batches.push(
          options.getLogs({ target: addr, eventAbi: LOCK_LIQUIDITY_DECREASED })
            .then((logs) => ({ addr, kind, logs })),
        );
      }
      return batches;
    }),
  );
  // Gauge-staking payout cuts on the up. lockers carry the token in the event.
  const lockerTokensPaidLogs = await Promise.all(
    [LOCKER_UP_V2, LOCKER_UP_CL].map((addr) =>
      options.getLogs({ target: addr, eventAbi: LOCK_TOKENS_PAID }),
    ),
  );

  // ── NFT AMM + loans ──────────────────────────────────────────────────────
  for (const log of [...soldLogs, ...boughtLogs]) {
    const bps = log.isSpecific ? SPECIFIC_FEE_BPS : RANDOM_FEE_BPS;
    dailyVolume.addGasToken((log.ethFeePaid * 10_000n) / bps);

    dailyFees.addGasToken(log.ethFeePaid, LABELS.AMM_FEES);
    dailySupplySideRevenue.addGasToken(log.boosterShare, LABELS.AMM_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.AMM_PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.protocolShare, LABELS.AMM_PROTOCOL_TREASURY);
  }

  for (const log of loansLogs) {
    dailyFees.addGasToken(log.ethFeePaid, LABELS.LOAN_FEES);
    dailySupplySideRevenue.addGasToken(log.boosterShare, LABELS.LOAN_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(log.protocolShare, LABELS.LOAN_PROTOCOL_TREASURY);
    dailyRevenue.addGasToken(log.protocolShare, LABELS.LOAN_PROTOCOL_TREASURY);
  }

  // ── Activation fees ──────────────────────────────────────────────────────
  for (const log of [...activatedLogs, ...upgradedLogs]) {
    const fee = BigInt(log.feePaid);
    dailyFees.addToken(STONKBROKER, fee, LABELS.ACTIVATION_FEES);
    dailyHoldersRevenue.addToken(
      STONKBROKER,
      (fee * ACTIVATION_BURN_BPS) / 10_000n,
      LABELS.ACTIVATION_BURN,
    );
    dailyProtocolRevenue.addToken(
      STONKBROKER,
      (fee * ACTIVATION_PROTOCOL_BPS) / 10_000n,
      LABELS.ACTIVATION_PROTOCOL,
    );
    dailyRevenue.addToken(STONKBROKER, fee, LABELS.ACTIVATION_FEES);
  }

  // ── Broker Box gachapon volume + fees ────────────────────────────────────
  // Volume: ticket notional at open + sell-back payouts + counter stock buys.
  // Fees: EdgeSkimmed (10% of settled ticket) + Certificate Counter $2 fee.
  // Official machines set creator = StockBooster, so creatorWei + boosterWei
  // both fund Clock In stock drops. protocolWei accrues for the treasury.
  for (const log of pullLogs) {
    const ticket = BigInt(log.ticketWei);
    if (ticket > 0n) dailyVolume.addGasToken(ticket);
  }
  // Sell-back pays 95% of the mark; the 5% spread stays in the machine bankroll
  // (reclaimable by treasury on official machines). Implied from payout: spread =
  // ethOut × 5/95. No separate fee event exists on-chain.
  for (const log of soldBackLogs) {
    const ethOut = BigInt(log.ethOut);
    if (ethOut <= 0n) continue;
    dailyVolume.addGasToken(ethOut);
    const spread = (ethOut * 5n) / 95n;
    if (spread > 0n) {
      dailyFees.addGasToken(spread, LABELS.GACHA_SELLBACK);
      dailyProtocolRevenue.addGasToken(spread, LABELS.GACHA_SELLBACK);
      dailyRevenue.addGasToken(spread, LABELS.GACHA_SELLBACK);
    }
  }
  for (const log of soldBackUsdgLogs) {
    const usdgOut = BigInt(log.usdgOut);
    if (usdgOut <= 0n) continue;
    dailyVolume.addToken(ROBINHOOD_USDG, usdgOut);
    const spread = (usdgOut * 5n) / 95n;
    if (spread > 0n) {
      dailyFees.addToken(ROBINHOOD_USDG, spread, LABELS.GACHA_SELLBACK);
      dailyProtocolRevenue.addToken(ROBINHOOD_USDG, spread, LABELS.GACHA_SELLBACK);
      dailyRevenue.addToken(ROBINHOOD_USDG, spread, LABELS.GACHA_SELLBACK);
    }
  }

  for (const log of edgeLogs) {
    const creator = BigInt(log.creatorWei);
    const booster = BigInt(log.boosterWei);
    const protocol = BigInt(log.protocolWei);
    const total = creator + booster + protocol;
    if (total <= 0n) continue;
    dailyFees.addGasToken(total, LABELS.GACHA_FEES);
    dailySupplySideRevenue.addGasToken(creator + booster, LABELS.GACHA_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(protocol, LABELS.GACHA_PROTOCOL);
    dailyRevenue.addGasToken(protocol, LABELS.GACHA_PROTOCOL);
  }

  for (const log of counterLogs) {
    const spend = BigInt(log.spendWei);
    const fee = BigInt(log.feeWei);
    if (spend > 0n) dailyVolume.addGasToken(spend);
    if (fee <= 0n) continue;
    const half = fee / 2n;
    const rest = fee - half; // remainder to treasury on odd wei
    dailyFees.addGasToken(fee, LABELS.COUNTER_FEES);
    dailySupplySideRevenue.addGasToken(half, LABELS.COUNTER_STOCK_DIVIDENDS);
    dailyProtocolRevenue.addGasToken(rest, LABELS.COUNTER_PROTOCOL);
    dailyRevenue.addGasToken(rest, LABELS.COUNTER_PROTOCOL);
  }

  // ── Anti-snipe fair-launch tax (one-off launches, e.g. $WALL) ────────────
  // Time-decay snipe tax on launch-curve buys (99% at the bell, −1%/minute).
  // Pushed live per trade: 90% StockBooster (Clock In dividends to activated
  // brokers) / 10% launch dev. The net raise bonds into permanently locked LP
  // at graduation, so the tax is the only fee leg that leaves the curve.
  for (const log of launchBuyLogs) {
    const ethIn = BigInt(log.ethIn);
    const tax = BigInt(log.taxPaid);
    if (ethIn > 0n) dailyVolume.addGasToken(ethIn);
    if (tax <= 0n) continue;
    const toBooster = (tax * LAUNCH_BOOSTER_BPS) / 10_000n;
    dailyFees.addGasToken(tax, LABELS.LAUNCH_TAX);
    dailySupplySideRevenue.addGasToken(toBooster, LABELS.LAUNCH_TAX_DIVIDENDS);
    // The 10% dev leg pays the launching team, not the protocol — counted in
    // fees, excluded from revenue/protocolRevenue.
    dailySupplySideRevenue.addGasToken(tax - toBooster, LABELS.LAUNCH_TAX_DEV);
  }

  // ── Safe Launch / Stonklauncher pads (V1 ETH + quoted + V2 + r2) ────────
  // Window buys AND sells pay the same decaying tax.
  // Volume (mirrors HoodMint ethGross discipline):
  //   buy  → quoteIn / ethIn (tax-inclusive gross)
  //   sell → quoteOut/ethOut + taxPaid (gross quote leaving the curve)
  // Field names differ by generation (ethIn on V1, quoteIn on V2) but are
  // positional twins — read both. Process buys/sells separately so a decoder
  // that zeroes missing fields cannot collapse sell volume to 0 via ethIn=0.
  // Fee split per launch snapshot: 16.5% creator / 16.5% protocol / 50%
  // locked-LP (or ICO Bonus on degen) / 17% Clock In Card. Protocol leg =
  // revenue; LP/ICO = supply-side. LpFeeBonded re-settles already-counted tax.
  for (let i = 0; i < SAFE_LAUNCH_PADS.length; i++) {
    const quote = SAFE_LAUNCH_PADS[i].quote;
    for (const log of safeBuyLogsByPad[i] ?? []) {
      const tax = BigInt(log.taxPaid ?? 0);
      const gross = BigInt(log.ethIn ?? log.quoteIn ?? 0);
      if (gross > 0n) addSafeQuote(dailyVolume, quote, gross);
      if (tax <= 0n) continue;
      const toCreator = (tax * SAFE_CREATOR_BPS) / 10_000n;
      const toProtocol = (tax * SAFE_PROTOCOL_BPS) / 10_000n;
      const toLp = (tax * SAFE_LP_BPS) / 10_000n;
      const toBoosterAndRef = tax - toCreator - toProtocol - toLp;
      addSafeQuote(dailyFees, quote, tax, LABELS.SAFE_TAX);
      addSafeQuote(dailyRevenue, quote, toProtocol, LABELS.SAFE_TAX_PROTOCOL);
      addSafeQuote(dailyProtocolRevenue, quote, toProtocol, LABELS.SAFE_TAX_PROTOCOL);
      addSafeQuote(dailySupplySideRevenue, quote, toCreator, LABELS.SAFE_TAX_CREATOR);
      addSafeQuote(dailySupplySideRevenue, quote, toBoosterAndRef, LABELS.SAFE_TAX_BOOSTER);
      addSafeQuote(dailySupplySideRevenue, quote, toLp, LABELS.SAFE_TAX_LP);
    }
    for (const log of safeSellLogsByPad[i] ?? []) {
      const tax = BigInt(log.taxPaid ?? 0);
      const netOut = BigInt(log.ethOut ?? log.quoteOut ?? 0);
      const gross = netOut + tax;
      if (gross > 0n) addSafeQuote(dailyVolume, quote, gross);
      if (tax <= 0n) continue;
      const toCreator = (tax * SAFE_CREATOR_BPS) / 10_000n;
      const toProtocol = (tax * SAFE_PROTOCOL_BPS) / 10_000n;
      const toLp = (tax * SAFE_LP_BPS) / 10_000n;
      const toBoosterAndRef = tax - toCreator - toProtocol - toLp;
      addSafeQuote(dailyFees, quote, tax, LABELS.SAFE_TAX);
      addSafeQuote(dailyRevenue, quote, toProtocol, LABELS.SAFE_TAX_PROTOCOL);
      addSafeQuote(dailyProtocolRevenue, quote, toProtocol, LABELS.SAFE_TAX_PROTOCOL);
      addSafeQuote(dailySupplySideRevenue, quote, toCreator, LABELS.SAFE_TAX_CREATOR);
      addSafeQuote(dailySupplySideRevenue, quote, toBoosterAndRef, LABELS.SAFE_TAX_BOOSTER);
      addSafeQuote(dailySupplySideRevenue, quote, toLp, LABELS.SAFE_TAX_LP);
    }
  }

  // ── Bonding-curve Stonk Launcher (closed factory, residual trades) ───────
  // Trade.feeAmount is the full 1% fee; waterfall 3333/3334/3333
  // creator / protocol / StonkBrokers. Quote on production launches is ETH.
  for (const log of curveTradeLogs) {
    const quoteAmt = BigInt(log.quoteAmount);
    const fee = BigInt(log.feeAmount);
    if (quoteAmt > 0n) dailyVolume.addGasToken(quoteAmt);
    if (fee <= 0n) continue;
    const toCreator = (fee * LAUNCHER_CREATOR_BPS) / 10_000n;
    const toStonk = (fee * LAUNCHER_STONK_BPS) / 10_000n;
    const toProtocol = fee - toCreator - toStonk;
    dailyFees.addGasToken(fee, LABELS.CURVE_FEES);
    dailyRevenue.addGasToken(toProtocol, LABELS.CURVE_PROTOCOL);
    dailyProtocolRevenue.addGasToken(toProtocol, LABELS.CURVE_PROTOCOL);
    dailySupplySideRevenue.addGasToken(toCreator, LABELS.CURVE_CREATOR);
    dailySupplySideRevenue.addGasToken(toStonk, LABELS.CURVE_STONK);
  }

  // ── Token vesting locker deposit fees (1 bps) ───────────────────────────
  for (const log of vestingLockedLogs) {
    const fee = BigInt(log.feeAmount);
    if (fee <= 0n) continue;
    const token = String(log.token || ZERO).toLowerCase();
    addProtocolCut(dailyFees, token, fee, LABELS.VESTING_FEES);
    addProtocolCut(dailyRevenue, token, fee, LABELS.VESTING_FEES);
    addProtocolCut(dailyProtocolRevenue, token, fee, LABELS.VESTING_FEES);
  }

  // ── Liquidity locker protocol cuts ───────────────────────────────────────
  // Attribute 90/10 to match SafetyDepositClockInV3's hardwired split.
  // Upfront-mode cuts that never emit LockFeesCollected are not visible here
  // (Robinhood has no Transfer-log fallback in addTokensReceived); collect /
  // withdraw cuts dominate live volume and are fully covered.
  const lockCache = new Map<string, [string, string]>();
  // Group by locker so lockPositions multicalls stay batched.
  const byLocker = new Map<string, { kind: LockerKind; logs: any[] }>();
  for (const { addr, kind, logs } of lockerLogBatches) {
    const key = addr.toLowerCase();
    let bucket = byLocker.get(key);
    if (!bucket) {
      bucket = { kind, logs: [] };
      byLocker.set(key, bucket);
    }
    bucket.logs.push(...logs);
  }
  for (const [locker, batch] of byLocker) {
    const ids = [...new Set(batch.logs.map((l) => String(l.lockTokenId)))];
    await resolveLockTokens(options, locker, ids, batch.kind, lockCache);
    for (const log of batch.logs) {
      const pair = lockCache.get(`${locker}:${String(log.lockTokenId)}`);
      if (!pair) continue;
      const amounts: [string, bigint][] = [
        [pair[0], BigInt(log.protocolAmount0)],
        [pair[1], BigInt(log.protocolAmount1)],
      ];
      for (const [token, amount] of amounts) {
        if (amount <= 0n) continue;
        const brokerAmt = (amount * LOCKER_BROKER_BPS) / 10_000n;
        const protocolAmt = (amount * LOCKER_PROTOCOL_BPS) / 10_000n;
        addProtocolCut(dailyFees, token, amount, LABELS.LOCKER_FEES);
        addProtocolCut(dailySupplySideRevenue, token, brokerAmt, LABELS.LOCKER_STOCK_DIVIDENDS);
        addProtocolCut(dailyProtocolRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
        addProtocolCut(dailyRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
      }
      // LockFeesCollected also carries the lock owner's 80% LP-fee share
      // (userAmount0/1) — genuine trading-fee income earned through the
      // protocol's locked positions, booked as supply-side. Withdrawal logs
      // (LockLiquidityDecreased, distinguished by the liquidity field) pay
      // PRINCIPAL in userAmount0/1 and must never be counted as fees.
      const isWithdraw = log.liquidity !== undefined && log.liquidity !== null;
      if (!isWithdraw) {
        const userAmounts: [string, bigint][] = [
          [pair[0], BigInt(log.userAmount0)],
          [pair[1], BigInt(log.userAmount1)],
        ];
        for (const [token, amount] of userAmounts) {
          if (amount <= 0n) continue;
          addProtocolCut(dailyFees, token, amount, LABELS.LOCKER_LP_FEES);
          addProtocolCut(dailySupplySideRevenue, token, amount, LABELS.LOCKER_LP_FEES);
        }
      }
    }
  }
  // Gauge-staking payout cuts (token address rides in the event).
  for (const logs of lockerTokensPaidLogs) {
    for (const log of logs) {
      const token = String(log.token || ZERO).toLowerCase();
      const amount = BigInt(log.protocolAmount);
      if (amount > 0n) {
        const brokerAmt = (amount * LOCKER_BROKER_BPS) / 10_000n;
        const protocolAmt = (amount * LOCKER_PROTOCOL_BPS) / 10_000n;
        addProtocolCut(dailyFees, token, amount, LABELS.LOCKER_FEES);
        addProtocolCut(dailySupplySideRevenue, token, brokerAmt, LABELS.LOCKER_STOCK_DIVIDENDS);
        addProtocolCut(dailyProtocolRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
        addProtocolCut(dailyRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
      }
      // Gauge-staking rewards paid to the lock owner (80% share) — earned
      // through the locked positions, booked gross as supply-side fees.
      const userAmt = BigInt(log.userAmount);
      if (userAmt > 0n) {
        addProtocolCut(dailyFees, token, userAmt, LABELS.LOCKER_LP_FEES);
        addProtocolCut(dailySupplySideRevenue, token, userAmt, LABELS.LOCKER_LP_FEES);
      }
    }
  }

  // ── Uniswap v4 protocol-owned liquidity fees ─────────────────────────────
  // The forever-escrowed STONK/ETH position earns LP fees on every swap in
  // the canonical v4 pool; the treasury is the escrow's sole irrevocable fee
  // recipient. v4 Swap deltas are user-perspective (negative = input token);
  // the LP fee is charged on the input amount at the event's fee (ppm).
  // currency0 on this pool is native ETH, currency1 is $STONKBROKER.
  if (polV4Liquidity > 0n) {
    for (const log of polV4SwapLogs) {
      const swapLiquidity = BigInt(log.liquidity);
      if (swapLiquidity <= 0n) continue;
      const posShareLiq =
        polV4Liquidity > swapLiquidity ? swapLiquidity : polV4Liquidity;
      const amount0 = BigInt(log.amount0);
      const amount1 = BigInt(log.amount1);
      const inputIsEth = amount0 < 0n;
      const inputAmount = inputIsEth ? -amount0 : -amount1;
      if (inputAmount <= 0n) continue;
      const feeAmount = (inputAmount * BigInt(log.fee)) / 1_000_000n;
      const escrowFee = (feeAmount * posShareLiq) / swapLiquidity;
      if (escrowFee <= 0n) continue;
      const token = inputIsEth ? ZERO : STONKBROKER;
      addProtocolCut(dailyFees, token, escrowFee, LABELS.POL_V4_FEES);
      addProtocolCut(dailyProtocolRevenue, token, escrowFee, LABELS.POL_V4_FEES);
      addProtocolCut(dailyRevenue, token, escrowFee, LABELS.POL_V4_FEES);
    }
  }

  // ── Smart LP vaults (Volatility Farming) ─────────────────────────────────
  // FeesCollected(fees0, fees1, skim0, skim1): fees = gross pool fees pulled
  // from the vault's Uniswap V3 position, skim = the 10% performance fee
  // (perfFeeBps) taken out of them. The remaining 90% auto-compounds back
  // into the position for depositors; the skim splits 50% StockBooster
  // (Clock In dividends — supply-side, matching every other booster leg
  // here) / 50% $STONKBROKER buybacks (holders revenue).
  {
    const activeIdx: number[] = [];
    smartLpFeeLogsByVault.forEach((logs, i) => {
      if (logs?.length) activeIdx.push(i);
    });
    if (activeIdx.length) {
      const [token0s, token1s] = await Promise.all([
        options.api.multiCall({
          abi: "address:token0",
          calls: activeIdx.map((i) => smartLpVaults[i]),
        }),
        options.api.multiCall({
          abi: "address:token1",
          calls: activeIdx.map((i) => smartLpVaults[i]),
        }),
      ]);
      activeIdx.forEach((vaultIdx, j) => {
        const pair: [string, string] = [token0s[j], token1s[j]];
        for (const log of smartLpFeeLogsByVault[vaultIdx]) {
          const legs: [string, bigint, bigint][] = [
            [pair[0], BigInt(log.fees0), BigInt(log.skim0)],
            [pair[1], BigInt(log.fees1), BigInt(log.skim1)],
          ];
          for (const [token, fees, skim] of legs) {
            if (fees <= 0n) continue;
            const buyback = skim / 2n;
            const dividends = skim - buyback;
            dailyFees.addToken(token, fees, LABELS.SMARTLP_FEES);
            dailySupplySideRevenue.addToken(token, fees - skim, LABELS.SMARTLP_COMPOUND);
            if (dividends > 0n)
              dailySupplySideRevenue.addToken(token, dividends, LABELS.SMARTLP_DIVIDENDS);
            if (buyback > 0n) {
              dailyHoldersRevenue.addToken(token, buyback, LABELS.SMARTLP_BUYBACK);
              dailyRevenue.addToken(token, buyback, LABELS.SMARTLP_BUYBACK);
            }
          }
        }
      });
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
};

/** Base: Relay swap-desk 1% app fee, measured as Base USDC leaving the fee wallet
 *  on its way to StockBooster via Relay (the wallet's only USDC outflows). */
const fetchBase = async (options: FetchOptions) => {
  const swapDeskFees = await addTokensReceived({options, fromAddressFilter: RELAY_FEE_WALLET, tokens: [BASE_USDC]});
  
  const dailyFees = swapDeskFees.clone(1, LABELS.SWAP_DESK_FEES);

  return {
    dailyFees,
    // Entire desk fee is forwarded to StockBooster as a Clock In bonus top-up —
    // supply-side only (mirrors how NFTFi booster share is attributed).
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      fetch: fetchRobinhood,
      start: "2026-07-17",
    },
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: "2026-07-17",
    },
  },
  doublecounted: true,
  methodology: {
    Volume:
      "Trading notional across every StonkBrokers / Stonklauncher surface: NFT AMM fills (ethFeePaid ÷ fee bps) + Broker Box tickets + Certificate Counter spend + Broker Box sell-backs + anti-snipe WallBought.ethIn + Safe Launch / Stonklauncher window buys AND sells on every pad generation (V1 ETH, V1 quoted, V2, r2 — buy = tax-inclusive quoteIn/ethIn, sell = quoteOut/ethOut + taxPaid, quote-token denominated on quoted/WETH lanes) + StonkCurvePool Trade.quoteAmount on the bonding-curve launcher.",
    Fees:
      "ETH fees on NFT AMM trades + NFT-backed loans; $STONKBROKER broker activation/upgrade fees; Broker Box gachapon 10% edge + 5% sell-back spread + Certificate Counter $2 fee; Safety Deposit Box liquidity-locker protocol cuts (Uniswap V3/V4 + up. DEX v2/CL lockers); the Relay swap-desk 1% app fee (Base USDC forwarded to StockBooster); the anti-snipe fair-launch snipe tax (time-decay tax on launch-curve buys, 90% StockBooster / 10% launch dev); Safe Launch / Stonklauncher snipe tax on window buys and sells across all pad generations (16.5% creator / 16.5% protocol / 50% locked-LP or ICO Bonus / 17% StockBooster + Clock In Card referrers); StonkCurvePool 1% trade fees (33/33/33 waterfall); StonkVestingLocker 0.01% deposit fees; Smart LP (Volatility Farming) vault pool fees — gross Uniswap V3 fees collected by every registry-listed vault (FeesCollected); LP trading fees claimed through the Safety Deposit Box locked positions (the lock owner's 80% share of LockFeesCollected plus gauge rewards from LockTokensPaid); and the protocol-owned Uniswap v4 STONK/ETH liquidity's LP fee income (the forever-escrowed dominant position, attributed per swap by its share of active liquidity).",
    Revenue:
      "Protocol-retained share: 30% of NFTFi ETH fees, protocol share of activation fees, Broker Box protocol accrual (5% of ticket) + sell-back spread + counter treasury half, 10% of locker fees, the 16.5% protocol leg of the Safe Launch / Stonklauncher snipe tax, 33.34% of bonding-curve trade fees, vesting-locker deposit fees, the $STONKBROKER-buyback half of the Smart LP 10% performance fee, and the protocol-owned Uniswap v4 STONK/ETH position's LP fee income (treasury is the escrow's sole irrevocable fee recipient).",
    ProtocolRevenue:
      "30% of NFTFi ETH fees → ProtocolFeeSink; protocol share of $STONKBROKER activation fees; Broker Box protocol accrual + sell-back bankroll spread + counter treasury half; 10% of locker fees → protocol wallet; 16.5% of the Safe Launch / Stonklauncher snipe tax → protocol accrual; 33.34% of bonding-curve trade fees; vesting-locker deposit fees; and the protocol-owned Uniswap v4 STONK/ETH position's LP fee income → treasury.",
    HoldersRevenue:
      "Half of the $STONKBROKER activation/upgrade fees burned, plus the $STONKBROKER-buyback half of the Smart LP 10% performance fee.",
    SupplySideRevenue:
      "70% of NFTFi ETH fees → StockBooster stock dividends; Broker Box creator+booster edge (5% of ticket on official machines) + counter StockBooster half; 90% of locker fees → SafetyDepositClockIn broker claims; Relay swap-desk 1% app fees forwarded to StockBooster; 90% of the anti-snipe launch tax → StockBooster dividends to activated brokers; 10% of the anti-snipe launch tax → launch dev; Safe Launch / Stonklauncher tax legs to the launch creator (16.5%), StockBooster + Clock In Card referrers (17%), and the permanently locked LP reserve / ICO Bonus (50%); bonding-curve creator (33.33%) + StonkBrokers Directed Clock In / pot (33.33%); Smart LP vault fees auto-compounded to depositors (90%) plus the StockBooster Clock In dividend half of the 10% performance fee; and the lock owners' 80% share of locked-LP trading fees + gauge rewards claimed through the Safety Deposit Box lockers.",
  },
  breakdownMethodology: {
    Volume: {
      [LABELS.AMM_FEES]:
        "NFT AMM trade notional implied from ethFeePaid ÷ fee bps (10% random / 15% specific).",
      [LABELS.GACHA_FEES]:
        "Broker Box PullOpened.ticketWei + SoldBack/SoldBackUsdg payouts + Certificate Counter spendWei.",
      [LABELS.LAUNCH_TAX]:
        "Anti-snipe one-off launch buys (WallBought.ethIn).",
      [LABELS.SAFE_TAX]:
        "Safe Launch / Stonklauncher window buy+sell notional on every pad (V1 ETH + V1 quoted + V2 + r2). Buys = tax-inclusive quote in; sells = net quote out + tax.",
      [LABELS.CURVE_FEES]:
        "StonkCurvePool Trade.quoteAmount (bonding-curve launcher residual volume).",
    },
    Fees: {
      [LABELS.AMM_FEES]: "ETH trade fees on buyRandomNFT / buySpecificNFT / sellNFT.",
      [LABELS.LOAN_FEES]: "Upfront ETH borrow fees on NFT-backed loans.",
      [LABELS.ACTIVATION_FEES]: "One-time / upgrade $STONKBROKER activation fees.",
      [LABELS.GACHA_FEES]: "10% house edge skimmed from every settled Broker Box ticket.",
      [LABELS.GACHA_SELLBACK]:
        "5% sell-back spread retained in the machine bankroll (implied from SoldBack / SoldBackUsdg payouts at 95% of mark).",
      [LABELS.COUNTER_FEES]: "Flat $2 Certificate Counter fee per OTC deed mint.",
      [LABELS.LOCKER_FEES]:
        "Protocol cut on Safety Deposit Box locks (Uniswap V3/V4 + up. DEX v2/CL lockers) from LockFeesCollected / LockLiquidityDecreased / LockTokensPaid (20% of LP fee collects / 1% withdraw; upfront 0.5% not evented).",
      [LABELS.SWAP_DESK_FEES]:
        "1% Relay app fee on the crypto swap desk, measured as Base USDC Transfer outflows from the fee wallet toward StockBooster.",
      [LABELS.LAUNCH_TAX]:
        "Time-decay snipe tax on anti-snipe fair-launch curve buys (99% at launch, falling 1%/minute over a 99-minute window; WallBought.taxPaid). Split 90% StockBooster / 10% launch dev, pushed live per trade.",
      [LABELS.SAFE_TAX]:
        "Time-decay snipe tax on Safe Launch / Stonklauncher window buys AND sells (SafeBuy/SafeSell taxPaid) across the V1 ETH pad, V1 quoted lanes, V2 lanes, and r2 pads. Split 16.5% launch creator / 16.5% protocol / 50% locked-LP reserve or ICO Bonus / 17% StockBooster + Clock In Card referrers, snapshotted per launch. Quoted-lane amounts are in the quote token.",
      [LABELS.CURVE_FEES]:
        "1% trade fee on StonkCurvePool (bonding-curve Stonk Launcher factory), waterfall 33.33% creator / 33.34% protocol / 33.33% StonkBrokers.",
      [LABELS.VESTING_FEES]:
        "0.01% (1 bps) StonkVestingLocker deposit fee (PositionLocked.feeAmount), routed to SafetyDepositClockInV3.",
      [LABELS.SMARTLP_FEES]:
        "Gross Uniswap V3 pool fees collected by every registry-listed Smart LP vault (SmartLpVault FeesCollected fees0/fees1).",
      [LABELS.LOCKER_LP_FEES]:
        "LP trading fees earned by positions locked in the Safety Deposit Box and claimed by lock owners — the 80% userAmount share of LockFeesCollected plus gauge-staking rewards (LockTokensPaid userAmount). Withdrawal principal (LockLiquidityDecreased) is excluded.",
      [LABELS.POL_V4_FEES]:
        "LP fee income of the protocol-owned Uniswap v4 STONK/ETH position (forever-escrowed, treasury is the sole irrevocable fee recipient). Computed from PoolManager Swap events on the canonical pool: input-amount × swap fee (ppm), attributed by the position's share of the active liquidity carried in each Swap log (the position is full range, so it is always in range).",
    },
    Revenue: {
      [LABELS.AMM_PROTOCOL_TREASURY]: "30% of ETH AMM fees retained by ProtocolFeeSink.",
      [LABELS.LOAN_PROTOCOL_TREASURY]: "30% of ETH loan fees retained by ProtocolFeeSink.",
      [LABELS.ACTIVATION_FEES]: "Full $STONKBROKER activation fee (burn + protocol).",
      [LABELS.GACHA_PROTOCOL]: "5% of Broker Box ticket accruing as protocol revenue.",
      [LABELS.GACHA_SELLBACK]:
        "5% sell-back spread retained in machine bankroll (treasury-reclaimable on official machines).",
      [LABELS.COUNTER_PROTOCOL]: "Half of the Certificate Counter $2 fee → treasury.",
      [LABELS.LOCKER_PROTOCOL]: "10% of locker protocol fees → protocol wallet.",
      [LABELS.SAFE_TAX_PROTOCOL]: "16.5% protocol leg of the Safe Launch / Stonklauncher snipe tax.",
      [LABELS.CURVE_PROTOCOL]: "33.34% of bonding-curve trade fees → protocol.",
      [LABELS.VESTING_FEES]: "StonkVestingLocker deposit fees → SafetyDepositClockInV3.",
      [LABELS.SMARTLP_BUYBACK]:
        "Half of the Smart LP 10% performance fee → $STONKBROKER buybacks.",
      [LABELS.POL_V4_FEES]:
        "Protocol-owned Uniswap v4 STONK/ETH LP fee income → treasury (escrow's sole irrevocable fee recipient).",
    },
    ProtocolRevenue: {
      [LABELS.AMM_PROTOCOL_TREASURY]: "30% of ETH AMM fees retained by ProtocolFeeSink.",
      [LABELS.LOAN_PROTOCOL_TREASURY]: "30% of ETH loan fees retained by ProtocolFeeSink.",
      [LABELS.ACTIVATION_PROTOCOL]: "Protocol share of $STONKBROKER activation fees.",
      [LABELS.GACHA_PROTOCOL]: "5% of Broker Box ticket accruing as protocol revenue.",
      [LABELS.GACHA_SELLBACK]:
        "5% sell-back spread retained in machine bankroll (treasury-reclaimable on official machines).",
      [LABELS.COUNTER_PROTOCOL]: "Half of the Certificate Counter $2 fee → treasury.",
      [LABELS.LOCKER_PROTOCOL]: "10% of locker protocol fees → protocol wallet.",
      [LABELS.SAFE_TAX_PROTOCOL]: "16.5% protocol leg of the Safe Launch / Stonklauncher snipe tax.",
      [LABELS.CURVE_PROTOCOL]: "33.34% of bonding-curve trade fees → protocol.",
      [LABELS.VESTING_FEES]: "StonkVestingLocker deposit fees → SafetyDepositClockInV3.",
      [LABELS.POL_V4_FEES]:
        "Protocol-owned Uniswap v4 STONK/ETH LP fee income → treasury (escrow's sole irrevocable fee recipient).",
    },
    HoldersRevenue: {
      [LABELS.ACTIVATION_BURN]: "Burned share of $STONKBROKER activation fees (deflationary).",
      [LABELS.SMARTLP_BUYBACK]:
        "Half of the Smart LP 10% performance fee → $STONKBROKER buybacks.",
    },
    SupplySideRevenue: {
      [LABELS.AMM_STOCK_DIVIDENDS]:
        "70% of ETH AMM fees → StockBooster stock-token dividend drops to activated brokers.",
      [LABELS.LOAN_STOCK_DIVIDENDS]:
        "70% of ETH loan fees → StockBooster stock-token dividend drops to activated brokers.",
      [LABELS.GACHA_STOCK_DIVIDENDS]:
        "Broker Box creator + StockBooster edge (5% of ticket on official machines) → Clock In.",
      [LABELS.COUNTER_STOCK_DIVIDENDS]: "Half of the Certificate Counter $2 fee → StockBooster.",
      [LABELS.LOCKER_STOCK_DIVIDENDS]:
        "90% of locker protocol fees → SafetyDepositClockIn broker claim rounds / StockBooster ETH flush.",
      [LABELS.SWAP_DESK_FEES]:
        "Relay swap-desk 1% app fee forwarded to StockBooster as a Clock In bonus top-up.",
      [LABELS.LAUNCH_TAX_DIVIDENDS]:
        "90% of the anti-snipe launch snipe tax → StockBooster → Clock In stock dividends to activated brokers.",
      [LABELS.LAUNCH_TAX_DEV]:
        "10% of the anti-snipe launch snipe tax → launch dev.",
      [LABELS.SAFE_TAX_CREATOR]: "16.5% of the Safe Launch / Stonklauncher snipe tax → launch creator.",
      [LABELS.SAFE_TAX_BOOSTER]:
        "17% of the Safe Launch / Stonklauncher snipe tax punched through the Clock In Card: ~0.5% of tax to the referrer, the rest to StockBooster Clock In dividends.",
      [LABELS.SAFE_TAX_LP]:
        "50% of the Safe Launch / Stonklauncher snipe tax escrowed as the launch's LP reserve (joins the raise at bond into permanently locked liquidity) or streamed to the ICO Bonus kickstarter on degen modes.",
      [LABELS.CURVE_CREATOR]: "33.33% of bonding-curve trade fees → launch creator.",
      [LABELS.CURVE_STONK]:
        "33.33% of bonding-curve trade fees → StonkBrokers Directed Clock In engine / jackpot pot.",
      [LABELS.SMARTLP_COMPOUND]:
        "90% of Smart LP vault pool fees auto-compounded back into the vault's position for depositors.",
      [LABELS.SMARTLP_DIVIDENDS]:
        "Half of the Smart LP 10% performance fee → StockBooster Clock In dividends to activated brokers.",
      [LABELS.LOCKER_LP_FEES]:
        "Lock owners' 80% share of LP trading fees + gauge rewards claimed through Safety Deposit Box locked positions.",
    },
  },
};

export default adapter;

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
 * 7. Safe Launch pad (StonkSafeLaunchpad, public go-live 2026-08-17): the
 *    permissionless generalization of the same anti-snipe curve as ONE
 *    singleton. Every window buy/sell pays the decaying snipe tax, split
 *    16.5% launch creator / 16.5% protocol accrual / 50% locked-LP reserve
 *    (escrowed per launch, deepens the token's own permanently locked pools
 *    at bond) / 17% StockBooster via the Clock In Card referral contract
 *    (~0.5% of tax pays the referrer, the rest funds Clock In dividends).
 *
 * Volume (protocol volume chart):
 * - NFT AMM notional (ethFeePaid ÷ fee bps)
 * - Broker Box ticket notional (PullOpened.ticketWei)
 * - Certificate Counter stock purchase (CertificateBought.spendWei)
 * - Broker Box sell-backs (SoldBack ethOut + SoldBackUsdg usdgOut)
 * - Anti-snipe launch buys (WallBought.ethIn)
 * - Safe Launch window trades (SafeBuy.ethIn + SafeSell gross ethOut+tax)
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

// Safe Launch pad — the permissionless singleton successor of the one-off
// anti-snipe launches above (launches keyed by id, no per-launch deploys).
// Public go-live 2026-08-17; append the pad address once deployed. The
// ClockInCard referral contract (0xcC9232eFD27B392fF9F96a6DCD45F12C9b6A1542)
// receives its slice THROUGH the pad's tax split, so only pad events are read
// (reading card events too would double count).
const SAFE_LAUNCH_PADS: string[] = [
  "0xEcA5726dae1e53365c37fFc02369d947A91d71f9", // StonkSafeLaunchpad, public open 2026-08-17 22:06 UTC
];
// Production tax split, applied by the go-live `setFeeSplit(1650, 1650, 5000)`
// and snapshotted into every launch: creator / protocol / locked-LP reserve,
// remainder (1700) punches through the Clock In Card → ~0.5% of tax to the
// referrer, the rest to StockBooster Clock In dividends.
const SAFE_CREATOR_BPS = 1650n;
const SAFE_PROTOCOL_BPS = 1650n;
const SAFE_LP_BPS = 5000n;

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
  SWAP_DESK_FEES: "Swap-desk Relay app fees (1%)",
  LAUNCH_TAX: "Anti-snipe launch tax (time-decay snipe tax on curve buys)",
  LAUNCH_TAX_DIVIDENDS: "Anti-snipe launch tax → StockBooster dividends (90%)",
  LAUNCH_TAX_DEV: "Anti-snipe launch tax → launch dev (10%)",
  SAFE_TAX: "Safe Launch snipe tax (time-decay tax on window trades)",
  SAFE_TAX_PROTOCOL: "Safe Launch tax → protocol accrual (16.5%)",
  SAFE_TAX_CREATOR: "Safe Launch tax → launch creator (16.5%)",
  SAFE_TAX_BOOSTER: "Safe Launch tax → StockBooster + Clock In Card referrers (17%)",
  SAFE_TAX_LP: "Safe Launch tax → permanently locked LP reserve (50%)",
};

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

  const [safeBuyLogs, safeSellLogs] = SAFE_LAUNCH_PADS.length
    ? await Promise.all([
        options.getLogs({ targets: SAFE_LAUNCH_PADS, eventAbi: SAFE_BUY }),
        options.getLogs({ targets: SAFE_LAUNCH_PADS, eventAbi: SAFE_SELL }),
      ])
    : [[], []];

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

  // ── Safe Launch pad (singleton anti-snipe curve, go-live 2026-08-17) ─────
  // Window buys AND sells pay the same decaying tax. Volume is gross ETH
  // notional (SafeBuy.ethIn includes the tax; SafeSell.ethOut is net of it).
  // Split per launch snapshot: 16.5% creator / 16.5% protocol / 50% locked-LP
  // reserve (escrowed, deepens the token's own permanently locked pools at
  // bond) / 17% via the Clock In Card (≈0.5% of tax to the referrer, rest to
  // StockBooster Clock In dividends). Only the protocol leg is revenue; the
  // LP reserve is deliberately supply-side — it becomes permanently locked
  // liquidity nobody can withdraw, not protocol income. LpFeeBonded at bond
  // re-settles already-counted tax (never re-added here).
  for (const log of [...safeBuyLogs, ...safeSellLogs]) {
    const tax = BigInt(log.taxPaid);
    const gross = log.ethIn !== undefined ? BigInt(log.ethIn) : BigInt(log.ethOut) + tax;
    if (gross > 0n) dailyVolume.addGasToken(gross);
    if (tax <= 0n) continue;
    const toCreator = (tax * SAFE_CREATOR_BPS) / 10_000n;
    const toProtocol = (tax * SAFE_PROTOCOL_BPS) / 10_000n;
    const toLp = (tax * SAFE_LP_BPS) / 10_000n;
    const toBoosterAndRef = tax - toCreator - toProtocol - toLp;
    dailyFees.addGasToken(tax, LABELS.SAFE_TAX);
    dailyRevenue.addGasToken(toProtocol, LABELS.SAFE_TAX_PROTOCOL);
    dailyProtocolRevenue.addGasToken(toProtocol, LABELS.SAFE_TAX_PROTOCOL);
    dailySupplySideRevenue.addGasToken(toCreator, LABELS.SAFE_TAX_CREATOR);
    dailySupplySideRevenue.addGasToken(toBoosterAndRef, LABELS.SAFE_TAX_BOOSTER);
    dailySupplySideRevenue.addGasToken(toLp, LABELS.SAFE_TAX_LP);
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
    }
  }
  // Gauge-staking payout cuts (token address rides in the event).
  for (const logs of lockerTokensPaidLogs) {
    for (const log of logs) {
      const token = String(log.token || ZERO).toLowerCase();
      const amount = BigInt(log.protocolAmount);
      if (amount <= 0n) continue;
      const brokerAmt = (amount * LOCKER_BROKER_BPS) / 10_000n;
      const protocolAmt = (amount * LOCKER_PROTOCOL_BPS) / 10_000n;
      addProtocolCut(dailyFees, token, amount, LABELS.LOCKER_FEES);
      addProtocolCut(dailySupplySideRevenue, token, brokerAmt, LABELS.LOCKER_STOCK_DIVIDENDS);
      addProtocolCut(dailyProtocolRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
      addProtocolCut(dailyRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
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
  methodology: {
    Volume:
      "ETH notional of StonkBrokers NFT AMM fills (ethFeePaid ÷ fee bps) + Broker Box ticket notional (PullOpened.ticketWei) + Certificate Counter stock purchases (spendWei) + Broker Box sell-backs (SoldBack ethOut + SoldBackUsdg usdgOut) + anti-snipe launch-curve buys (WallBought.ethIn) + Safe Launch window trades (SafeBuy.ethIn and SafeSell gross ethOut + tax).",
    Fees:
      "ETH fees on NFT AMM trades + NFT-backed loans; $STONKBROKER broker activation/upgrade fees; Broker Box gachapon 10% edge + 5% sell-back spread + Certificate Counter $2 fee; Safety Deposit Box liquidity-locker protocol cuts (Uniswap V3/V4 + up. DEX v2/CL lockers); the Relay swap-desk 1% app fee (Base USDC forwarded to StockBooster); the anti-snipe fair-launch snipe tax (time-decay tax on launch-curve buys, 90% StockBooster / 10% launch dev); and the Safe Launch pad snipe tax on window buys and sells (16.5% creator / 16.5% protocol / 50% locked-LP reserve / 17% StockBooster + Clock In Card referrers).",
    Revenue:
      "Protocol-retained share: 30% of NFTFi ETH fees, protocol share of activation fees, Broker Box protocol accrual (5% of ticket) + sell-back spread + counter treasury half, 10% of locker fees, and the 16.5% protocol leg of the Safe Launch snipe tax.",
    ProtocolRevenue:
      "30% of NFTFi ETH fees → ProtocolFeeSink; protocol share of $STONKBROKER activation fees; Broker Box protocol accrual + sell-back bankroll spread + counter treasury half; 10% of locker fees → protocol wallet; 16.5% of the Safe Launch snipe tax → protocol accrual.",
    HoldersRevenue:
      "Half of the $STONKBROKER activation/upgrade fees burned.",
    SupplySideRevenue:
      "70% of NFTFi ETH fees → StockBooster stock dividends; Broker Box creator+booster edge (5% of ticket on official machines) + counter StockBooster half; 90% of locker fees → SafetyDepositClockIn broker claims; Relay swap-desk 1% app fees forwarded to StockBooster; 90% of the anti-snipe launch tax → StockBooster dividends to activated brokers; 10% of the anti-snipe launch tax → launch dev; Safe Launch tax legs to the launch creator (16.5%), StockBooster + Clock In Card referrers (17%), and the permanently locked LP reserve (50%).",
  },
  breakdownMethodology: {
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
        "Time-decay snipe tax on Safe Launch pad window buys AND sells (SafeBuy/SafeSell taxPaid). Split 16.5% launch creator / 16.5% protocol / 50% locked-LP reserve / 17% StockBooster + Clock In Card referrers, snapshotted per launch.",
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
      [LABELS.SAFE_TAX_PROTOCOL]: "16.5% protocol leg of the Safe Launch snipe tax.",
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
      [LABELS.SAFE_TAX_PROTOCOL]: "16.5% protocol leg of the Safe Launch snipe tax.",
    },
    HoldersRevenue: {
      [LABELS.ACTIVATION_BURN]: "Burned share of $STONKBROKER activation fees (deflationary).",
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
      [LABELS.SAFE_TAX_CREATOR]: "16.5% of the Safe Launch snipe tax → launch creator.",
      [LABELS.SAFE_TAX_BOOSTER]:
        "17% of the Safe Launch snipe tax punched through the Clock In Card: ~0.5% of tax to the referrer, the rest to StockBooster Clock In dividends.",
      [LABELS.SAFE_TAX_LP]:
        "50% of the Safe Launch snipe tax escrowed as the launch's LP reserve — joins the raise at bond and becomes permanently locked liquidity (excess uncoverable by the token reserve goes to StockBooster).",
    },
  },
};

export default adapter;

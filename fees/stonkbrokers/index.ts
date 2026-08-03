import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { addTokensReceived } from "../../helpers/token";

/**
 * StonkBrokers — Anvil NFTFi + Broker Box + Safety Deposit Box on Robinhood,
 * plus the Relay swap-desk fee rail on Base.
 *
 * Fee sources:
 *  1. NFT AMM trades + NFT-backed loans (70% StockBooster / 30% ProtocolFeeSink)
 *  2. Broker activation fees in $STONKBROKER (50% burn / 50% protocol)
 *  3. Broker Box gachapon edge (10% of ticket: 5% StockBooster+creator / 5% protocol)
 *     plus Certificate Counter flat $2 fee ($1 StockBooster / $1 treasury)
 *  4. Safety Deposit Box liquidity-locker protocol cuts (V3 + V4) →
 *     SafetyDepositClockInV3 (90% brokers / 10% protocol wallet)
 *  5. Swap-desk 1% Relay app fee: Base USDC forwarded from the fee wallet
 *     (claimed from Relay, then bridged to StockBooster as ETH)
 *
 * Volume (protocol volume chart):
 *  - NFT AMM notional (ethFeePaid ÷ fee bps)
 *  - Broker Box ticket notional (PullOpened.ticketWei)
 *  - Certificate Counter stock purchase (CertificateBought.spendWei)
 *  - Broker Box sell-backs (SoldBack ethOut + SoldBackUsdg usdgOut)
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

// Safety Deposit Box lockers → fee router (live 2026-07-25).
const LOCKER_V3 = "0xFc96CF67eCC55bE4AdABc3AecBe6Ad6349f11223";
const LOCKER_V4 = "0x5a28ce098750f73bc9eC142D4bCE464E1A0BBdA6";
// Fee sink (not read on-chain here): SafetyDepositClockInV3
// 0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c — splits locker cuts 90/10.

// Relay swap-desk 1% app fee accrues off-chain, is claimed as Base USDC to the
// treasury fee wallet, then forwarded via Relay to StockBooster as ETH.
const RELAY_FEE_WALLET = "0xb668382cF44038a3E8140E789060F6A809787CDa";
const BASE_USDC = ADDRESSES.base.USDC;

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
};

const RANDOM_FEE_BPS = 1000n;
const SPECIFIC_FEE_BPS = 1500n;
const ACTIVATION_BURN_BPS = 5000n;
const ACTIVATION_PROTOCOL_BPS = 5000n;
const LOCKER_PROTOCOL_BPS = 1000n; // SafetyDepositClockInV3 PROTOCOL_BPS
const LOCKER_BROKER_BPS = 9000n;

const ZERO = "0x0000000000000000000000000000000000000000";

/** Resolve token0/token1 (or currency0/currency1) for a lock, caching per id. */
async function resolveLockTokens(
  options: FetchOptions,
  locker: string,
  lockIds: string[],
  isV4: boolean,
  cache: Map<string, [string, string]>,
) {
  const missing = lockIds.filter((id) => !cache.has(`${locker}:${id}`));
  if (missing.length === 0) return;

  if (isV4) {
    // V4Lock: currency0, currency1, fee, tickSpacing, hooks, tickLower, tickUpper, ...
    const abi =
      "function lockPositions(uint256) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks, int24 tickLower, int24 tickUpper, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed)";
    const rows = await options.api.multiCall({
      abi,
      calls: missing.map((id) => ({ target: locker, params: [id] })),
      permitFailure: true,
    });
    rows.forEach((row: any, i: number) => {
      if (!row) return;
      cache.set(`${locker}:${missing[i]}`, [
        (row.currency0 || row[0] || ZERO).toLowerCase(),
        (row.currency1 || row[1] || ZERO).toLowerCase(),
      ]);
    });
  } else {
    // LockPosition: positionTokenId, lockTokenId, token0, token1, ...
    const abi =
      "function lockPositions(uint256) view returns (uint256 positionTokenId, uint256 lockTokenId, address token0, address token1, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed)";
    const rows = await options.api.multiCall({
      abi,
      calls: missing.map((id) => ({ target: locker, params: [id] })),
      permitFailure: true,
    });
    rows.forEach((row: any, i: number) => {
      if (!row) return;
      cache.set(`${locker}:${missing[i]}`, [
        (row.token0 || row[2] || ZERO).toLowerCase(),
        (row.token1 || row[3] || ZERO).toLowerCase(),
      ]);
    });
  }
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

const LOCKER_META: { addr: string; isV4: boolean }[] = [
  { addr: LOCKER_V3, isV4: false },
  { addr: LOCKER_V4, isV4: true },
];
const LOCKER_SET = new Map(LOCKER_META.map((l) => [l.addr.toLowerCase(), l.isV4]));

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
  // cuts are read from the fee events + a lockPositions lookup.
  const [lockerCollectLogs, lockerDecreaseLogs] = await Promise.all([
    options.getLogs({
      targets: [LOCKER_V3, LOCKER_V4],
      eventAbi: LOCK_FEES_COLLECTED,
    }),
    options.getLogs({
      targets: [LOCKER_V3, LOCKER_V4],
      eventAbi: LOCK_LIQUIDITY_DECREASED,
    }),
  ]);

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

  // ── Liquidity locker protocol cuts ───────────────────────────────────────
  // Attribute 90/10 to match SafetyDepositClockInV3's hardwired split.
  // Upfront-mode cuts that never emit LockFeesCollected are not visible here
  // (Robinhood has no Transfer-log fallback in addTokensReceived); collect /
  // withdraw cuts dominate live volume and are fully covered.
  const lockCache = new Map<string, [string, string]>();
  const lockerLogs = [...lockerCollectLogs, ...lockerDecreaseLogs];
  // Group by locker so lockPositions multicalls stay batched.
  const byLocker = new Map<string, { isV4: boolean; logs: any[] }>();
  for (const log of lockerLogs) {
    const addr = String(log.address).toLowerCase();
    let bucket = byLocker.get(addr);
    if (!bucket) {
      bucket = { isV4: LOCKER_SET.get(addr)!, logs: [] };
      byLocker.set(addr, bucket);
    }
    bucket.logs.push( log);
  }
  for (const [locker, batch] of byLocker) {
    const ids = [...new Set(batch.logs.map((l) => String(l.lockTokenId)))];
    await resolveLockTokens(options, locker, ids, batch.isV4, lockCache);
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
      "ETH notional of StonkBrokers NFT AMM fills (ethFeePaid ÷ fee bps) + Broker Box ticket notional (PullOpened.ticketWei) + Certificate Counter stock purchases (spendWei) + Broker Box sell-backs (SoldBack ethOut + SoldBackUsdg usdgOut).",
    Fees:
      "ETH fees on NFT AMM trades + NFT-backed loans; $STONKBROKER broker activation/upgrade fees; Broker Box gachapon 10% edge + 5% sell-back spread + Certificate Counter $2 fee; Safety Deposit Box liquidity-locker protocol cuts; and the Relay swap-desk 1% app fee (Base USDC forwarded to StockBooster).",
    Revenue:
      "Protocol-retained share: 30% of NFTFi ETH fees, protocol share of activation fees, Broker Box protocol accrual (5% of ticket) + sell-back spread + counter treasury half, and 10% of locker fees.",
    ProtocolRevenue:
      "30% of NFTFi ETH fees → ProtocolFeeSink; protocol share of $STONKBROKER activation fees; Broker Box protocol accrual + sell-back bankroll spread + counter treasury half; 10% of locker fees → protocol wallet.",
    HoldersRevenue:
      "Half of the $STONKBROKER activation/upgrade fees burned.",
    SupplySideRevenue:
      "70% of NFTFi ETH fees → StockBooster stock dividends; Broker Box creator+booster edge (5% of ticket on official machines) + counter StockBooster half; 90% of locker fees → SafetyDepositClockIn broker claims; Relay swap-desk 1% app fees forwarded to StockBooster.",
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
        "Protocol cut on Safety Deposit Box locks from LockFeesCollected / LockLiquidityDecreased (20% of LP fee collects / 1% withdraw; upfront 0.5% not evented).",
      [LABELS.SWAP_DESK_FEES]:
        "1% Relay app fee on the crypto swap desk, measured as Base USDC Transfer outflows from the fee wallet toward StockBooster.",
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
    },
  },
};

export default adapter;

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

/**
 * Exactly Protocol (https://exact.ly)
 * Decentralized, non-custodial lending protocol providing both variable (floating) rate
 * and fixed-term rate borrowing/lending across discrete monthly maturities.
 *
 * Docs: https://docs.exact.ly
 * Audits: https://github.com/exactly/audits
 * GitHub: https://github.com/exactly/protocol
 */

interface ChainConfig {
  auditor: string;
  start: string;
}

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.OPTIMISM]: {
    // Official Auditor contract on Optimism (https://optimistic.etherscan.io/address/0xaEb62e6F27BC103702E7BC879AE98bceA56f027E)
    // Deployed at block 78,310,663 (~2023-03-04); also listed in DefiLlama TVL adapter (projects/exactly/index.js)
    auditor: "0xaEb62e6F27BC103702E7BC879AE98bceA56f027E",
    start: "2023-03-04",
  },
  [CHAIN.BASE]: {
    // Official Auditor contract on Base (https://basescan.org/address/0x0Aeb0BCB919858C0a4dceC3EeD879985034A597c)
    // Deployed at block 38,135,747 (2025-11-13T19:07:21Z); also listed in DefiLlama TVL adapter (projects/exactly/index.js)
    auditor: "0x0Aeb0BCB919858C0a4dceC3EeD879985034A597c",
    start: "2025-11-14",
  },
  [CHAIN.ETHEREUM]: {
    // Official Auditor contract on Ethereum Mainnet (https://etherscan.io/address/0x310A2694521f75C7B2b64b5937C16CE65C3EFE01)
    // Deployed at block 15,868,410 (~2022-11-01); also listed in DefiLlama TVL adapter (projects/exactly/index.js)
    auditor: "0x310A2694521f75C7B2b64b5937C16CE65C3EFE01",
    start: "2022-11-01",
  },
};

const BORROW_EVENT =
  "event Borrow(address indexed caller, address indexed receiver, address indexed borrower, uint256 assets, uint256 shares)";
const REPAY_EVENT =
  "event Repay(address indexed caller, address indexed borrower, uint256 assets, uint256 shares)";
const BORROW_AT_MATURITY_EVENT =
  "event BorrowAtMaturity(uint256 indexed maturity, address caller, address indexed receiver, address indexed borrower, uint256 assets, uint256 fee)";
const REPAY_AT_MATURITY_EVENT =
  "event RepayAtMaturity(uint256 indexed maturity, address indexed caller, address indexed borrower, uint256 assets, uint256 positionAssets)";
const WITHDRAW_AT_MATURITY_EVENT =
  "event WithdrawAtMaturity(uint256 indexed maturity, address caller, address indexed receiver, address indexed owner, uint256 positionAssets, uint256 assets)";
const LIQUIDATE_EVENT =
  "event Liquidate(address indexed receiver, address indexed borrower, uint256 assets, uint256 lendersAssets, address indexed seizeMarket, uint256 seizedAssets)";

const WAD = 10n ** 18n;

const getLogMarket = (log: any): string =>
  String(log.address ?? log.target ?? "").toLowerCase();

const getLogArg = (log: any, name: string): bigint => {
  const val = log.args?.[name] ?? log[name];
  return val !== undefined ? BigInt(val) : 0n;
};

/**
 * Reconstructs Exactly's FixedLib.distributeEarnings logic:
 * - backupSupplied = borrowed - min(borrowed, supplied)
 * - backupEarnings = earnings * (borrowAmount - min(backupSupplied, borrowAmount)) / borrowAmount
 * - unassignedEarnings = earnings - backupEarnings
 * In collectFreeLunch: when treasuryFeeRate != 0, all backupEarnings go to treasury;
 * otherwise backupEarnings go to earningsAccumulator (lenders).
 */
const distributeEarnings = (
  borrowed: bigint,
  supplied: bigint,
  earnings: bigint,
  borrowAmount: bigint
): { unassignedEarnings: bigint; backupEarnings: bigint } => {
  if (borrowAmount === 0n || earnings === 0n) {
    return { unassignedEarnings: earnings, backupEarnings: 0n };
  }
  const minBorrowSupplied = borrowed < supplied ? borrowed : supplied;
  const backupSup = borrowed - minBorrowSupplied;
  const minCover = backupSup < borrowAmount ? backupSup : borrowAmount;
  const backupEarnings = (earnings * (borrowAmount - minCover)) / borrowAmount;
  const unassignedEarnings = earnings - backupEarnings;
  return { unassignedEarnings, backupEarnings };
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (!config) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
  }

  // 1. Discover all active markets from Auditor
  const rawMarkets: string[] = await options.api.call({
    target: config.auditor,
    abi: "function allMarkets() view returns (address[])",
  });

  if (!rawMarkets || rawMarkets.length === 0) {
    return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
  }

  const markets = rawMarkets.map((m) => m.toLowerCase());

  // 2. Multi-call underlying assets and dynamic treasury fee rates
  const [underlyings, treasuryFeeRates, debtBefore, debtAfter] = await Promise.all([
    options.toApi.multiCall({ abi: "address:asset", calls: markets }),
    options.toApi.multiCall({ abi: "uint256:treasuryFeeRate", calls: markets }),
    options.fromApi.multiCall({
      abi: "function totalFloatingBorrowAssets() view returns (uint256)",
      calls: markets,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      abi: "function totalFloatingBorrowAssets() view returns (uint256)",
      calls: markets,
      permitFailure: true,
    }),
  ]);

  // 3. Query all fee and flow events across markets in parallel
  const [
    borrowLogs,
    repayLogs,
    borrowAtMaturityLogs,
    repayAtMaturityLogs,
    withdrawAtMaturityLogs,
    liquidateLogs,
  ] = await Promise.all([
    options.getLogs({ targets: markets, eventAbi: BORROW_EVENT, onlyArgs: false }),
    options.getLogs({ targets: markets, eventAbi: REPAY_EVENT, onlyArgs: false }),
    options.getLogs({ targets: markets, eventAbi: BORROW_AT_MATURITY_EVENT, onlyArgs: false }),
    options.getLogs({ targets: markets, eventAbi: REPAY_AT_MATURITY_EVENT, onlyArgs: false }),
    options.getLogs({ targets: markets, eventAbi: WITHDRAW_AT_MATURITY_EVENT, onlyArgs: false }),
    options.getLogs({ targets: markets, eventAbi: LIQUIDATE_EVENT, onlyArgs: false }),
  ]);

  const marketFeeRates: Record<string, bigint> = {};
  markets.forEach((m, idx) => {
    marketFeeRates[m] = BigInt(treasuryFeeRates[idx] ?? 0);
  });

  // Query pool balances (borrowed, supplied) for maturities with fixed borrow/withdraw activity
  const poolKeySet = new Set<string>();
  const poolKeys: { market: string; maturity: string }[] = [];

  for (const log of [...borrowAtMaturityLogs, ...withdrawAtMaturityLogs]) {
    const market = getLogMarket(log);
    const maturity = String(getLogArg(log, "maturity"));
    const key = `${market}:${maturity}`;
    if (!poolKeySet.has(key)) {
      poolKeySet.add(key);
      poolKeys.push({ market, maturity });
    }
  }

  const poolBalances: Record<string, { borrowed: bigint; supplied: bigint }> = {};
  if (poolKeys.length > 0) {
    const poolRes = await options.toApi.multiCall({
      abi: "function fixedPoolBalance(uint256) view returns (uint256 borrowed, uint256 supplied)",
      calls: poolKeys.map((p) => ({ target: p.market, params: [p.maturity] })),
      permitFailure: true,
    });
    for (let i = 0; i < poolKeys.length; i++) {
      const p = poolKeys[i];
      const res = poolRes[i];
      poolBalances[`${p.market}:${p.maturity}`] = {
        borrowed: res ? BigInt(res.borrowed ?? res[0] ?? 0) : 0n,
        supplied: res ? BigInt(res.supplied ?? res[1] ?? 0) : 0n,
      };
    }
  }

  // Aggregate logs by market address
  const borrowsByMarket: Record<string, bigint> = {};
  for (const log of borrowLogs) {
    const market = getLogMarket(log);
    borrowsByMarket[market] = (borrowsByMarket[market] ?? 0n) + getLogArg(log, "assets");
  }

  const repaysByMarket: Record<string, bigint> = {};
  for (const log of repayLogs) {
    const market = getLogMarket(log);
    repaysByMarket[market] = (repaysByMarket[market] ?? 0n) + getLogArg(log, "assets");
  }

  // Fixed borrow fee accumulation per market reconstructing FixedLib.distributeEarnings
  const fixedBorrowFeesByMarket: Record<
    string,
    { grossFee: bigint; protocolCut: bigint; supplyCut: bigint }
  > = {};
  for (const log of borrowAtMaturityLogs) {
    const market = getLogMarket(log);
    const fee = getLogArg(log, "fee");
    const assets = getLogArg(log, "assets");
    const maturity = String(getLogArg(log, "maturity"));
    const feeRate = marketFeeRates[market] ?? 0n;

    if (fee > 0n) {
      const rateBasedCut = (fee * feeRate) / WAD;
      const earnings = fee - rateBasedCut;
      const pool = poolBalances[`${market}:${maturity}`] ?? { borrowed: 0n, supplied: 0n };
      const { backupEarnings } = distributeEarnings(
        pool.borrowed,
        pool.supplied,
        earnings,
        assets
      );

      // In collectFreeLunch: when treasuryFeeRate != 0, backupEarnings goes to treasury; otherwise to lenders
      const protocolCut = feeRate !== 0n ? rateBasedCut + backupEarnings : 0n;
      const supplyCut = fee - protocolCut;

      const current = fixedBorrowFeesByMarket[market] ?? {
        grossFee: 0n,
        protocolCut: 0n,
        supplyCut: 0n,
      };
      fixedBorrowFeesByMarket[market] = {
        grossFee: current.grossFee + fee,
        protocolCut: current.protocolCut + protocolCut,
        supplyCut: current.supplyCut + supplyCut,
      };
    }
  }

  const latePenaltiesByMarket: Record<string, bigint> = {};
  for (const log of repayAtMaturityLogs) {
    const market = getLogMarket(log);
    const assets = getLogArg(log, "assets");
    const positionAssets = getLogArg(log, "positionAssets");
    if (assets > positionAssets) {
      latePenaltiesByMarket[market] =
        (latePenaltiesByMarket[market] ?? 0n) + (assets - positionAssets);
    }
  }

  // Early withdrawal fee accumulation reconstructing FixedLib.distributeEarnings
  const earlyWithdrawalFeesByMarket: Record<
    string,
    { grossFee: bigint; protocolCut: bigint; supplyCut: bigint }
  > = {};
  for (const log of withdrawAtMaturityLogs) {
    const market = getLogMarket(log);
    const positionAssets = getLogArg(log, "positionAssets");
    const assets = getLogArg(log, "assets");
    const maturity = String(getLogArg(log, "maturity"));
    const feeRate = marketFeeRates[market] ?? 0n;

    if (positionAssets > assets) {
      const fee = positionAssets - assets;
      const rateBasedCut = (fee * feeRate) / WAD;
      const earnings = fee - rateBasedCut;
      const pool = poolBalances[`${market}:${maturity}`] ?? { borrowed: 0n, supplied: 0n };
      const { backupEarnings } = distributeEarnings(
        pool.borrowed,
        pool.supplied,
        earnings,
        assets
      );

      const protocolCut = feeRate !== 0n ? rateBasedCut + backupEarnings : 0n;
      const supplyCut = fee - protocolCut;

      const current = earlyWithdrawalFeesByMarket[market] ?? {
        grossFee: 0n,
        protocolCut: 0n,
        supplyCut: 0n,
      };
      earlyWithdrawalFeesByMarket[market] = {
        grossFee: current.grossFee + fee,
        protocolCut: current.protocolCut + protocolCut,
        supplyCut: current.supplyCut + supplyCut,
      };
    }
  }

  const liquidationFeesByMarket: Record<string, bigint> = {};
  for (const log of liquidateLogs) {
    const market = getLogMarket(log);
    liquidationFeesByMarket[market] =
      (liquidationFeesByMarket[market] ?? 0n) + getLogArg(log, "lendersAssets");
  }

  // 4. Compute fees and revenue per market
  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    const token = underlyings[i];
    if (!token) continue;

    const feeRate = BigInt(treasuryFeeRates[i] ?? 0);

    // A. Variable (Floating) Borrow Interest
    const before = BigInt(debtBefore[i] ?? 0);
    const after = BigInt(debtAfter[i] ?? 0);
    const totalBorrows = borrowsByMarket[market] ?? 0n;
    const totalRepays = repaysByMarket[market] ?? 0n;

    let floatingInterest = after - before - totalBorrows + totalRepays;
    if (floatingInterest > 0n) {
      const protocolCut = (floatingInterest * feeRate) / WAD;
      const supplyCut = floatingInterest - protocolCut;

      dailyFees.add(token, floatingInterest, METRIC.BORROW_INTEREST);
      dailyRevenue.add(token, protocolCut, "Borrow Interest To Treasury");
      dailyProtocolRevenue.add(token, protocolCut, "Borrow Interest To Treasury");
      dailySupplySideRevenue.add(token, supplyCut, "Borrow Interest To Lenders");
    }

    // B. Fixed-Term Borrow Interest (Upfront Fee)
    const fixedFees = fixedBorrowFeesByMarket[market];
    if (fixedFees && fixedFees.grossFee > 0n) {
      dailyFees.add(token, fixedFees.grossFee, METRIC.BORROW_INTEREST);
      dailyRevenue.add(token, fixedFees.protocolCut, "Borrow Interest To Treasury");
      dailyProtocolRevenue.add(token, fixedFees.protocolCut, "Borrow Interest To Treasury");
      dailySupplySideRevenue.add(token, fixedFees.supplyCut, "Borrow Interest To Lenders");
    }

    // C. Late Repayment Penalty on Fixed Borrows (accrues 100% to pool lenders)
    const latePenalties = latePenaltiesByMarket[market] ?? 0n;
    if (latePenalties > 0n) {
      dailyFees.add(token, latePenalties, METRIC.BORROW_INTEREST);
      dailySupplySideRevenue.add(token, latePenalties, "Borrow Interest To Lenders");
    }

    // D. Early Withdrawal Penalty on Fixed Deposits
    const earlyFees = earlyWithdrawalFeesByMarket[market];
    if (earlyFees && earlyFees.grossFee > 0n) {
      dailyFees.add(token, earlyFees.grossFee, METRIC.DEPOSIT_WITHDRAW_FEES);
      dailyRevenue.add(token, earlyFees.protocolCut, "Deposit/Withdraw Fees To Treasury");
      dailyProtocolRevenue.add(token, earlyFees.protocolCut, "Deposit/Withdraw Fees To Treasury");
      dailySupplySideRevenue.add(token, earlyFees.supplyCut, "Deposit/Withdraw Fees To Lenders");
    }

    // E. Liquidation Incentives/Penalties Paid to Pool Lenders (accrues 100% to pool lenders)
    const liquidationFees = liquidationFeesByMarket[market] ?? 0n;
    if (liquidationFees > 0n) {
      dailyFees.add(token, liquidationFees, METRIC.LIQUIDATION_FEES);
      dailySupplySideRevenue.add(token, liquidationFees, "Liquidation Fees To Lenders");
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Total interest and fees paid by borrowers across variable (floating) and fixed-rate pools, early withdrawal penalties, and liquidation penalties.",
  Revenue: "Portion of borrow interest and early withdrawal fees directed to the protocol treasury based on the market treasury fee rate.",
  ProtocolRevenue: "Portion of borrow interest and early withdrawal fees directed to the protocol treasury based on the market treasury fee rate.",
  SupplySideRevenue: "Borrow interest, late repayment penalties, early withdrawal penalties, and liquidation penalties earned by lenders and depositors.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: "Interest paid by borrowers in variable (floating) and fixed-term pools, plus late repayment penalties.",
    [METRIC.DEPOSIT_WITHDRAW_FEES]: "Penalties charged to depositors who withdraw before maturity from fixed-term deposit pools.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation penalties paid by liquidated accounts to the pool lenders.",
  },
  Revenue: {
    "Borrow Interest To Treasury": "Protocol treasury fee share of variable and fixed-term borrow interest.",
    "Deposit/Withdraw Fees To Treasury": "Protocol treasury fee share of fixed deposit early withdrawal penalties.",
  },
  ProtocolRevenue: {
    "Borrow Interest To Treasury": "Protocol treasury fee share of variable and fixed-term borrow interest.",
    "Deposit/Withdraw Fees To Treasury": "Protocol treasury fee share of fixed deposit early withdrawal penalties.",
  },
  SupplySideRevenue: {
    "Borrow Interest To Lenders": "Borrow interest and late repayment penalties distributed to floating and fixed pool lenders.",
    "Deposit/Withdraw Fees To Lenders": "Early withdrawal penalties distributed to fixed pool lenders.",
    "Liquidation Fees To Lenders": "Liquidation penalties added to earnings accumulator and distributed to lenders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;

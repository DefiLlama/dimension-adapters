import BigNumber from "bignumber.js";
import { ethers } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Matrixdock docs:
// STBT FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/treasury-bill-token-stbt/faq
// XAUm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/faq
// XAUm contract addresses: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/smart-contract/contract-address
// XAGm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/faq
// XAGm token design / reconcileSupply fee model: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/token-design
// XAGm contract addresses: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/smart-contract/contract-address

// STBT contract address is from the STBT docs. It emits InterestsDistributed for holder rebases.
const STBT = "0x530824da86689c9c17cdc2871ff29b058345b44a";
// XAGm and XAUm Ethereum MTokenMain addresses are from their Matrixdock contract-address docs.
const XAGM = "0x123ffe0a3C62878dcbee2742227dc8990058d9E1";
const XAUM = "0x2103E845C5E135493Bb6c2A4f0B8651956eA8682";
// Deployment/start blocks supplied from verified contract deployment history.
const STBT_START_BLOCK = 16431887;
const XAUM_START_BLOCK = 20624233;
const XAGM_START_BLOCK = 24618377;
const XAUM_START_TIMESTAMP = 1724803200; // 2024-08-28
const XAGM_START_TIMESTAMP = 1773014400; // 2026-03-09
// XAGm FAQ: redemption fee is 0.50%.
const XAGM_REDEMPTION_FEE_BPS = 50;
// XAUm FAQ: redemption fee is 0.25%.
const XAUM_REDEMPTION_FEE_BPS = 25;
const BPS = 10_000n;

const YEAR_SECONDS = 365 * 24 * 60 * 60;
// Matrixdock announcement: STBT custodian fee reduced from 0.35% p.a. to 0.20% p.a.
// Effective 2026-04-28 00:00 UTC+8, i.e. 2026-04-27 16:00 UTC.
const FEE_CHANGE_TIMESTAMP = 1777305600; // 2026-04-28 00:00 UTC+8
const STBT_FEE_SCHEDULE = [
  { fromTimestamp: 0, feeApy: 0.0035 },
  { fromTimestamp: FEE_CHANGE_TIMESTAMP, feeApy: 0.002 },
];

const INTERESTS_DISTRIBUTED_EVENT =
  "event InterestsDistributed(int256 interest, uint256 newTotalSupply, uint256 interestFromTime, uint256 interestToTime)";
const RECONCILE_SUPPLY_EVENT =
  "event ReconcileSupply(uint64 lastReconcileTime, uint64 thisReconcileTime, uint256 amount)";
const REDEEM_EVENT =
  "event Redeem(address indexed customer, uint256 amount, bytes data)";
const TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";

const STBT_YIELD = "STBT Yield";
const STBT_YIELD_TO_HOLDERS = "STBT Yield To Holders";
const STBT_CUSTODIAN_FEES = "STBT Custodian Fees";
const XAGM_CUSTODY_FEES = "XAGm Custody Fees";
const XAGM_REDEMPTION_FEES = "XAGm Redemption Fees";
const XAUM_REDEMPTION_FEES = "XAUm Redemption Fees";

const toUsd = (amount: BigNumber) => amount.div(1e18).toNumber();

const getFromBlock = async (options: FetchOptions, productStartBlock: number) => {
  return Math.max(await options.getFromBlock(), productStartBlock);
};

const getStbtCustodianFee = (supply: BigNumber, fromTimestamp: number, toTimestamp: number) => {
  let fee = new BigNumber(0);

  for (let i = 0; i < STBT_FEE_SCHEDULE.length; i++) {
    const currentRate = STBT_FEE_SCHEDULE[i];
    const nextRate = STBT_FEE_SCHEDULE[i + 1];
    const periodStart = Math.max(fromTimestamp, currentRate.fromTimestamp);
    const periodEnd = Math.min(toTimestamp, nextRate?.fromTimestamp ?? toTimestamp);

    if (periodEnd <= periodStart) continue;

    fee = fee.plus(
      supply
        .times(currentRate.feeApy)
        .times(periodEnd - periodStart)
        .div(YEAR_SECONDS),
    );
  }

  return fee;
};

const addStbtFees = async (
  options: FetchOptions,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) => {
  const fromBlock = await getFromBlock(options, STBT_START_BLOCK);
  const logs = await options.getLogs({
    target: STBT,
    eventAbi: INTERESTS_DISTRIBUTED_EVENT,
    fromBlock,
  });

  logs.forEach((log) => {
    const netYield = new BigNumber(log.interest.toString());
    if (!netYield.gt(0)) return;

    const interestFromTime = Number(log.interestFromTime);
    const interestToTime = Number(log.interestToTime);
    if (interestToTime <= interestFromTime) return;

    const newTotalSupply = new BigNumber(log.newTotalSupply.toString());
    const preRebaseSupply = newTotalSupply.minus(netYield);
    if (!preRebaseSupply.gt(0)) return;

    const protocolFee = getStbtCustodianFee(preRebaseSupply, interestFromTime, interestToTime);
    const grossYield = netYield.plus(protocolFee);

    balances.dailyFees.addUSDValue(toUsd(grossYield), STBT_YIELD);
    balances.dailySupplySideRevenue.addUSDValue(toUsd(netYield), STBT_YIELD_TO_HOLDERS);
    balances.dailyRevenue.addUSDValue(toUsd(protocolFee), STBT_CUSTODIAN_FEES);
  });
};

const addRedemptionFees = async (
  options: FetchOptions,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
  config: {
    token: string;
    feeBps: number;
    label: string;
    symbol: string;
    fromBlock: number;
  },
) => {
  const fromBlock = await getFromBlock(options, config.fromBlock);
  const operator = (await options.api.call({
    target: config.token,
    // Matrixdock MToken redeem burns from operator and emits customer in Redeem.
    abi: "function operator() view returns (address)",
  })).toLowerCase();

  const [redeemLogs, burnLogs] = await Promise.all([
    options.getLogs({
      target: config.token,
      eventAbi: REDEEM_EVENT,
      fromBlock,
      entireLog: true,
      parseLog: true,
      skipIndexer: true,
    }),
    options.getLogs({
      target: config.token,
      eventAbi: TRANSFER_EVENT,
      fromBlock,
      topics: [
        null as any,
        null as any,
        ethers.zeroPadValue(ADDRESSES.null, 32),
      ],
      entireLog: true,
      parseLog: true,
      skipIndexer: true,
    }),
  ]);

  const burnsByTxAndOperator = new Map<string, bigint>();
  burnLogs.forEach((log) => {
    if (!log.transactionHash) return;
    const txHash = log.transactionHash.toLowerCase();
    const from = log.args.from.toLowerCase();
    if (from !== operator) return;
    const key = `${txHash}:${from}`;
    const previous = burnsByTxAndOperator.get(key) ?? 0n;
    burnsByTxAndOperator.set(key, previous + BigInt(log.args.value.toString()));
  });

  const redeemsByTxAndOperator = new Map<string, bigint>();
  redeemLogs.forEach((log) => {
    const amount = BigInt(log.args.amount.toString());
    const txHash = log.transactionHash?.toLowerCase();
    if (!txHash) {
      throw new Error(`${config.symbol} Redeem burn safety check failed for tx ${txHash ?? "unknown"}`);
    }

    const key = `${txHash}:${operator}`;
    const previous = redeemsByTxAndOperator.get(key) ?? 0n;
    redeemsByTxAndOperator.set(key, previous + amount);
  });

  redeemsByTxAndOperator.forEach((amount, key) => {
    const txHash = key.split(":")[0];
    if (burnsByTxAndOperator.get(key) !== amount) {
      throw new Error(`${config.symbol} Redeem burn safety check failed for tx ${txHash}`);
    }

    const redemptionFee = amount * BigInt(config.feeBps) / BPS;
    balances.dailyFees.add(config.token, redemptionFee, config.label);
    balances.dailyRevenue.add(config.token, redemptionFee, config.label);
  });
};

const addXagmFees = async (
  options: FetchOptions,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) => {
  if (options.toTimestamp < XAGM_START_TIMESTAMP) return;

  const feeCollector = (await options.api.call({
    target: XAGM,
    // XAGm MToken exposes feeCollector; reconcileSupply mints custody fees to it.
    abi: "function feeCollector() view returns (address)",
  })).toLowerCase();

  const fromBlock = await getFromBlock(options, XAGM_START_BLOCK);
  const [reconcileLogs, transferLogs] = await Promise.all([
    options.getLogs({
      target: XAGM,
      eventAbi: RECONCILE_SUPPLY_EVENT,
      fromBlock,
      entireLog: true,
      parseLog: true,
      skipIndexer: true,
    }),
    options.getLogs({
      target: XAGM,
      eventAbi: TRANSFER_EVENT,
      fromBlock,
      topics: [
        null as any,
        ethers.zeroPadValue(ADDRESSES.null, 32),
        ethers.zeroPadValue(feeCollector, 32),
      ],
      entireLog: true,
      parseLog: true,
      skipIndexer: true,
    }),
  ]);

  const feeMintsByTx = new Map<string, bigint>();
  transferLogs.forEach((log) => {
    if (!log.transactionHash) return;
    const txHash = log.transactionHash.toLowerCase();
    const previous = feeMintsByTx.get(txHash) ?? 0n;
    feeMintsByTx.set(txHash, previous + BigInt(log.args.value.toString()));
  });

  const reconcileMintsByTx = new Map<string, bigint>();
  reconcileLogs.forEach((log) => {
    const amount = BigInt(log.args.amount.toString());
    const txHash = log.transactionHash?.toLowerCase();
    if (!txHash) {
      throw new Error(`XAGm ReconcileSupply fee mint safety check failed for tx ${txHash ?? "unknown"}`);
    }

    const previous = reconcileMintsByTx.get(txHash) ?? 0n;
    reconcileMintsByTx.set(txHash, previous + amount);
  });

  reconcileMintsByTx.forEach((amount, txHash) => {
    if (feeMintsByTx.get(txHash) !== amount) {
      throw new Error(`XAGm ReconcileSupply fee mint safety check failed for tx ${txHash}`);
    }

    balances.dailyFees.add(XAGM, amount, XAGM_CUSTODY_FEES);
    balances.dailyRevenue.add(XAGM, amount, XAGM_CUSTODY_FEES);
  });

  await addRedemptionFees(options, balances, {
    token: XAGM,
    feeBps: XAGM_REDEMPTION_FEE_BPS,
    label: XAGM_REDEMPTION_FEES,
    symbol: "XAGm",
    fromBlock: XAGM_START_BLOCK,
  });
};

const addXaumFees = async (
  options: FetchOptions,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) => {
  if (options.toTimestamp < XAUM_START_TIMESTAMP) return;

  await addRedemptionFees(options, balances, {
    token: XAUM,
    feeBps: XAUM_REDEMPTION_FEE_BPS,
    label: XAUM_REDEMPTION_FEES,
    symbol: "XAUm",
    fromBlock: XAUM_START_BLOCK,
  });
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();

  await addStbtFees(options, { dailyFees, dailySupplySideRevenue, dailyRevenue });
  await addXagmFees(options, { dailyFees, dailyRevenue });
  await addXaumFees(options, { dailyFees, dailyRevenue });

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-01-18",
    },
  },
  methodology: {
    Fees: "Matrixdock fees include gross STBT yield before custodian fees, XAGm custody fees minted by reconcileSupply, and XAGm/XAUm redemption fees.",
    SupplySideRevenue: "Net STBT interest distributed to holders through InterestsDistributed rebases.",
    Revenue: "STBT custodian fees, XAGm custody fees, and XAGm/XAUm redemption fees, accounted as protocol revenue.",
    ProtocolRevenue: "Same as Revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [STBT_YIELD]: "Gross STBT asset yield before custodian fees. The STBT custodian fee is 0.35% p.a. before 2026-04-28 00:00 UTC+8 and 0.20% p.a. after.",
      [XAGM_CUSTODY_FEES]: "XAGm custody fees minted to the fee collector during ReconcileSupply events.",
      [XAGM_REDEMPTION_FEES]: "0.50% fee charged on XAGm redemption orders.",
      [XAUM_REDEMPTION_FEES]: "0.25% fee charged on XAUm redemption orders.",
    },
    SupplySideRevenue: {
      [STBT_YIELD_TO_HOLDERS]: "Net STBT interest distributed to holders via the InterestsDistributed event.",
    },
    Revenue: {
      [STBT_CUSTODIAN_FEES]: "STBT custodian fee calculated from pre-rebase STBT supply over each positive rebase period, using the applicable annual rate.",
      [XAGM_CUSTODY_FEES]: "XAGm custody fees minted to the fee collector during ReconcileSupply events, validated against the matching mint Transfer in the same transaction.",
      [XAGM_REDEMPTION_FEES]: "0.50% XAGm redemption fee, validated against the matching burn Transfer from the redeeming customer in the same transaction.",
      [XAUM_REDEMPTION_FEES]: "0.25% XAUm redemption fee, validated against the matching burn Transfer from the redeeming customer in the same transaction.",
    },
    ProtocolRevenue: {
      [STBT_CUSTODIAN_FEES]: "STBT custodian fee accounted as protocol revenue.",
      [XAGM_CUSTODY_FEES]: "XAGm custody fee accounted as protocol revenue.",
      [XAGM_REDEMPTION_FEES]: "XAGm redemption fee accounted as protocol revenue.",
      [XAUM_REDEMPTION_FEES]: "XAUm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;

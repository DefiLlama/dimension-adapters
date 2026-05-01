import { ethers } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Matrixdock XAGm sources:
// XAGm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/faq
// XAGm token design / reconcileSupply fee model: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/token-design
// XAGm contract addresses: https://matrixdock.gitbook.io/matrixdock-docs/english/silver-token-xagm/smart-contract/contract-address

// XAGm Ethereum MTokenMain address is from the Matrixdock contract-address docs.
const XAGM = "0x123ffe0a3C62878dcbee2742227dc8990058d9E1";
// Deployment/start block supplied from verified contract deployment history.
const XAGM_START_BLOCK = 24618377;
const XAGM_START_TIMESTAMP = 1773014400; // 2026-03-09
// XAGm FAQ: redemption fee is 0.50%.
const XAGM_REDEMPTION_FEE_BPS = 50;
const BPS = 10_000n;
const RECONCILE_SUPPLY_EVENT =
  "event ReconcileSupply(uint64 lastReconcileTime, uint64 thisReconcileTime, uint256 amount)";
const REDEEM_EVENT =
  "event Redeem(address indexed customer, uint256 amount, bytes data)";
const TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";

const XAGM_CUSTODY_FEES = "XAGm Custody Fees";
const XAGM_REDEMPTION_FEES = "XAGm Redemption Fees";

const getFromBlock = async (options: FetchOptions, productStartBlock: number) => {
  return Math.max(await options.getFromBlock(), productStartBlock);
};

const addXagmCustodyFees = async (
  options: FetchOptions,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) => {
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
};

const addRedemptionFees = async (
  options: FetchOptions,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) => {
  const fromBlock = await getFromBlock(options, XAGM_START_BLOCK);
  const operator = (await options.api.call({
    target: XAGM,
    // Matrixdock MToken redeem burns from operator and emits customer in Redeem.
    abi: "function operator() view returns (address)",
  })).toLowerCase();

  const [redeemLogs, burnLogs] = await Promise.all([
    options.getLogs({
      target: XAGM,
      eventAbi: REDEEM_EVENT,
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
      throw new Error(`XAGm Redeem burn safety check failed for tx ${txHash ?? "unknown"}`);
    }

    const key = `${txHash}:${operator}`;
    const previous = redeemsByTxAndOperator.get(key) ?? 0n;
    redeemsByTxAndOperator.set(key, previous + amount);
  });

  redeemsByTxAndOperator.forEach((amount, key) => {
    const txHash = key.split(":")[0];
    if (burnsByTxAndOperator.get(key) !== amount) {
      throw new Error(`XAGm Redeem burn safety check failed for tx ${txHash}`);
    }

    const redemptionFee = amount * BigInt(XAGM_REDEMPTION_FEE_BPS) / BPS;
    balances.dailyFees.add(XAGM, redemptionFee, XAGM_REDEMPTION_FEES);
    balances.dailyRevenue.add(XAGM, redemptionFee, XAGM_REDEMPTION_FEES);
  });
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (options.toTimestamp >= XAGM_START_TIMESTAMP) {
    await addXagmCustodyFees(options, { dailyFees, dailyRevenue });
    await addRedemptionFees(options, { dailyFees, dailyRevenue });
  }

  return {
    dailyFees,
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
      start: "2026-03-09",
    },
  },
  methodology: {
    Fees: "XAGm custody fees minted by reconcileSupply and XAGm redemption fees.",
    Revenue: "XAGm custody and redemption fees accounted as protocol revenue.",
    ProtocolRevenue: "Same as Revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [XAGM_CUSTODY_FEES]: "XAGm custody fees minted to the fee collector during ReconcileSupply events.",
      [XAGM_REDEMPTION_FEES]: "0.50% fee charged on XAGm redemption orders.",
    },
    Revenue: {
      [XAGM_CUSTODY_FEES]: "XAGm custody fees minted to the fee collector during ReconcileSupply events, validated against the matching mint Transfer in the same transaction.",
      [XAGM_REDEMPTION_FEES]: "0.50% XAGm redemption fee, validated against the matching burn Transfer from the MToken operator in the same transaction.",
    },
    ProtocolRevenue: {
      [XAGM_CUSTODY_FEES]: "XAGm custody fee accounted as protocol revenue.",
      [XAGM_REDEMPTION_FEES]: "XAGm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;

import { ethers } from "ethers";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// Matrixdock XAUm sources:
// XAUm FAQ / fees: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/faq
// XAUm contract addresses: https://matrixdock.gitbook.io/matrixdock-docs/english/gold-token-xaum/smart-contract/contract-address

// XAUm Ethereum MTokenMain address is from the Matrixdock contract-address docs.
const XAUM = "0x2103E845C5E135493Bb6c2A4f0B8651956eA8682";
// Deployment/start block supplied from verified contract deployment history.
const XAUM_START_BLOCK = 20624233;
const XAUM_START_TIMESTAMP = 1724803200; // 2024-08-28
// XAUm FAQ: redemption fee is 0.25%.
const XAUM_REDEMPTION_FEE_BPS = 25;
const BPS = 10_000n;
const REDEEM_EVENT =
  "event Redeem(address indexed customer, uint256 amount, bytes data)";
const TRANSFER_EVENT =
  "event Transfer(address indexed from, address indexed to, uint256 value)";
const XAUM_REDEMPTION_FEES = "XAUm Redemption Fees";

const getFromBlock = async (options: FetchOptions, productStartBlock: number) => {
  return Math.max(await options.getFromBlock(), productStartBlock);
};

const addRedemptionFees = async (
  options: FetchOptions,
  balances: {
    dailyFees: ReturnType<FetchOptions["createBalances"]>;
    dailyRevenue: ReturnType<FetchOptions["createBalances"]>;
  },
) => {
  const fromBlock = await getFromBlock(options, XAUM_START_BLOCK);
  const operator = (await options.api.call({
    target: XAUM,
    // Matrixdock MToken redeem burns from operator and emits customer in Redeem.
    abi: "function operator() view returns (address)",
  })).toLowerCase();

  const [redeemLogs, burnLogs] = await Promise.all([
    options.getLogs({
      target: XAUM,
      eventAbi: REDEEM_EVENT,
      fromBlock,
      entireLog: true,
      parseLog: true,
      skipIndexer: true,
    }),
    options.getLogs({
      target: XAUM,
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
      throw new Error(`XAUm Redeem burn safety check failed for tx ${txHash ?? "unknown"}`);
    }

    const key = `${txHash}:${operator}`;
    const previous = redeemsByTxAndOperator.get(key) ?? 0n;
    redeemsByTxAndOperator.set(key, previous + amount);
  });

  redeemsByTxAndOperator.forEach((amount, key) => {
    const txHash = key.split(":")[0];
    if (burnsByTxAndOperator.get(key) !== amount) {
      throw new Error(`XAUm Redeem burn safety check failed for tx ${txHash}`);
    }

    const redemptionFee = amount * BigInt(XAUM_REDEMPTION_FEE_BPS) / BPS;
    balances.dailyFees.add(XAUM, redemptionFee, XAUM_REDEMPTION_FEES);
    balances.dailyRevenue.add(XAUM, redemptionFee, XAUM_REDEMPTION_FEES);
  });
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  if (options.toTimestamp >= XAUM_START_TIMESTAMP) {
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
      start: "2024-08-28",
    },
  },
  methodology: {
    Fees: "XAUm redemption fees.",
    Revenue: "XAUm redemption fees accounted as protocol revenue.",
    ProtocolRevenue: "Same as Revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [XAUM_REDEMPTION_FEES]: "0.25% fee charged on XAUm redemption orders.",
    },
    Revenue: {
      [XAUM_REDEMPTION_FEES]: "0.25% XAUm redemption fee, validated against the matching burn Transfer from the MToken operator in the same transaction.",
    },
    ProtocolRevenue: {
      [XAUM_REDEMPTION_FEES]: "XAUm redemption fee accounted as protocol revenue.",
    },
  },
};

export default adapter;

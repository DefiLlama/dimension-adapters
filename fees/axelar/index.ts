// fees/axelar/index.ts
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import BigNumber from "bignumber.js";
import { ethers } from "ethers";

const GAS_SERVICE: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.ARBITRUM]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.OPTIMISM]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.POLYGON]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.AVAX]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.BSC]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.BASE]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.FANTOM]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.LINEA]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.CELO]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.MANTLE]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.BLAST]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.MODE]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  [CHAIN.SCROLL]: "0x2d5d7d31F671F86C782533cc367F14109a082712",
};

const ABI = [
  "event GasPaidForContractCall(address indexed sourceAddress, string destinationChain, string destinationAddress, bytes32 indexed payloadHash, address gasToken, uint256 gasFeeAmount, address refundAddress)",
  "event GasPaidForContractCallWithToken(address indexed sourceAddress, string destinationChain, string destinationAddress, bytes32 indexed payloadHash, string symbol, uint256 amount, address gasToken, uint256 gasFeeAmount, address refundAddress)",
  "event NativeGasPaidForContractCall(address indexed sourceAddress, string destinationChain, string destinationAddress, bytes32 indexed payloadHash, uint256 nativeGasAmount, address refundAddress)",
  "event GasPaidForExpressCall(address indexed sourceAddress, string destinationChain, string destinationAddress, bytes32 indexed payloadHash, address gasToken, uint256 gasFeeAmount, address refundAddress)",
  "event NativeGasPaidForExpressCall(address indexed sourceAddress, string destinationChain, string destinationAddress, bytes32 indexed payloadHash, uint256 nativeGasAmount, address refundAddress)",
  "event GasAdded(bytes32 indexed txHash, uint256 indexed logIndex, address gasToken, uint256 gasFeeAmount, address refundAddress)",
  "event NativeGasAdded(bytes32 indexed txHash, uint256 indexed logIndex, uint256 gasFeeAmount, address refundAddress)",
  "event Refunded(address indexed sourceAddress, bytes32 indexed transactionHash, address token, uint256 amount, address refundAddress)"
];

const iface = new ethers.Interface(ABI);

const TOPICS = {
  GasPaidForContractCall: iface.getEvent("GasPaidForContractCall")!.topicHash,
  GasPaidForContractCallWithToken: iface.getEvent("GasPaidForContractCallWithToken")!.topicHash,
  NativeGasPaidForContractCall: iface.getEvent("NativeGasPaidForContractCall")!.topicHash,
  GasPaidForExpressCall: iface.getEvent("GasPaidForExpressCall")!.topicHash,
  NativeGasPaidForExpressCall: iface.getEvent("NativeGasPaidForExpressCall")!.topicHash,
  GasAdded: iface.getEvent("GasAdded")!.topicHash,
  NativeGasAdded: iface.getEvent("NativeGasAdded")!.topicHash,
  Refunded: iface.getEvent("Refunded")!.topicHash,
};

function extractFeeWei(log: any): BigNumber {
  try {
    const parsed = iface.parseLog(log);
    if (!parsed) return new BigNumber(0);

    if (parsed.name.includes("Native")) {
      return new BigNumber(parsed.args.nativeGasAmount || parsed.args.gasFeeAmount || 0);
    }
    return new BigNumber(parsed.args.gasFeeAmount || 0);
  } catch (e) {
    return new BigNumber(0);
  }
}

const fetchChain = async (options: FetchOptions) => {
  const { chain, getLogs } = options;
  const target = GAS_SERVICE[chain];

  if (!target) return { dailyFees: "0", dailyUserFees: "0", dailyRevenue: "0" };

  // Fetch all fee-related logs
  const logs = await getLogs({
    target,
    topics: [[
      TOPICS.GasPaidForContractCall,
      TOPICS.GasPaidForContractCallWithToken,
      TOPICS.NativeGasPaidForContractCall,
      TOPICS.GasPaidForExpressCall,
      TOPICS.NativeGasPaidForExpressCall,
      TOPICS.GasAdded,
      TOPICS.NativeGasAdded,
    ]] as any,
    onlyArgs: false,
  });

  let totalWei = new BigNumber(0);
  const balances = options.createBalances();

  for (const log of logs) {
    totalWei = totalWei.plus(extractFeeWei(log));

    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const amount = parsed.args.gasFeeAmount || parsed.args.nativeGasAmount;
      if (!amount) continue;
      const gasToken = parsed.args.gasToken || "0x0000000000000000000000000000000000000000";
      balances.add(gasToken, amount.toString());
    } catch {}
  }

  // Fetch refund logs
  const refundLogs = await getLogs({
    target,
    topics: [[TOPICS.Refunded]] as any,
    onlyArgs: false,
  });

  let totalRefunded = new BigNumber(0);
  for (const log of refundLogs) {
    try {
      const parsed = iface.parseLog(log);
      if (!parsed) continue;
      const refundedAmount = new BigNumber(parsed.args.amount || 0);
      totalRefunded = totalRefunded.plus(refundedAmount);

      const token = parsed?.args.token || "0x0000000000000000000000000000000000000000";
      balances.add(token, `-${refundedAmount.toString()}`);
    } catch {}
  }

  // Subtract refunded total from totalWei
  totalWei = totalWei.minus(totalRefunded);

  return {
    dailyFees: balances,
    dailyUserFees: balances,
    dailyRevenue: "0",
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchChain, start: "2022-02-01" },
    [CHAIN.ARBITRUM]: { fetch: fetchChain, start: "2022-04-10" },
    [CHAIN.OPTIMISM]: { fetch: fetchChain, start: "2022-05-20" },
    [CHAIN.POLYGON]: { fetch: fetchChain, start: "2022-03-15" },
    [CHAIN.AVAX]: { fetch: fetchChain, start: "2022-03-15" },
    [CHAIN.BSC]: { fetch: fetchChain, start: "2022-03-15" },
    [CHAIN.BASE]: { fetch: fetchChain, start: "2023-07-15" },
    [CHAIN.FANTOM]: { fetch: fetchChain, start: "2022-03-15" },
    [CHAIN.LINEA]: { fetch: fetchChain, start: "2023-07-15" },
    [CHAIN.CELO]: { fetch: fetchChain, start: "2022-03-15" },
    [CHAIN.MANTLE]: { fetch: fetchChain, start: "2023-07-15" },
    [CHAIN.BLAST]: { fetch: fetchChain, start: "2024-02-20" },
    [CHAIN.MODE]: { fetch: fetchChain, start: "2024-01-20" },
    [CHAIN.SCROLL]: { fetch: fetchChain, start: "2023-10-10" },
  },
};

export default adapter;

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
  const parsed = iface.parseLog(log);
  if (!parsed) return new BigNumber(0);

  if (parsed.name.includes("Native")) {
    return new BigNumber(parsed.args.nativeGasAmount || parsed.args.gasFeeAmount || 0);
  }
  return new BigNumber(parsed.args.gasFeeAmount || 0);
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const target = GAS_SERVICE[options.chain];

  const gaspaidforcontractcalllogs = await options.getLogs({
    target, topics: [TOPICS.GasPaidForContractCall] as any, onlyArgs: false
  });
  const gaspaidforcontractcallwithtokenlogs = await options.getLogs({
    target, topics: [TOPICS.GasPaidForContractCallWithToken] as any, onlyArgs: false,
  });
  const nativegaspaidforcontractcalllogs = await options.getLogs({
    target, topics: [TOPICS.NativeGasPaidForContractCall] as any, onlyArgs: false,
  })
  const gaspaidforexpresscalllogs = await options.getLogs({
    target, topics: [TOPICS.GasPaidForExpressCall] as any, onlyArgs: false,
  });
  const nativegaspaidforexpresscalllogs = await options.getLogs({
    target, topics: [TOPICS.NativeGasPaidForExpressCall] as any, onlyArgs: false,
  });
  const gasaddedlogs = await options.getLogs({
    target, topics: [TOPICS.GasAdded] as any, onlyArgs: false,
  });
  const nativegasaddedlogs = await options.getLogs({
    target, topics: [TOPICS.NativeGasAdded] as any, onlyArgs: false,
  });
  const refundLogs = await options.getLogs({
    target, topics: [TOPICS.Refunded] as any, onlyArgs: false,
  });

  let totalWei = new BigNumber(0);
  const allLogs = [ ...gaspaidforcontractcalllogs, ...gaspaidforcontractcallwithtokenlogs, ...nativegaspaidforcontractcalllogs, ...gaspaidforexpresscalllogs, ...nativegaspaidforexpresscalllogs, ...gasaddedlogs, ...nativegasaddedlogs ];

  for (const log of allLogs) {
    totalWei = totalWei.plus(extractFeeWei(log));

    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    const amount = parsed.args.gasFeeAmount || parsed.args.nativeGasAmount;
    if (!amount) continue;
    const gasToken = parsed.args.gasToken || "0x0000000000000000000000000000000000000000";
    dailyFees.add(gasToken, amount.toString());
  }

  let totalRefunded = new BigNumber(0);
  for (const log of refundLogs) {
    const parsed = iface.parseLog(log);
    if (!parsed) continue;
    const refundedAmount = new BigNumber(parsed.args.amount || 0);
    totalRefunded = totalRefunded.plus(refundedAmount);

    const token = parsed?.args.token || "0x0000000000000000000000000000000000000000";
    dailyFees.add(token, `-${refundedAmount.toString()}`);
  }

  totalWei = totalWei.minus(totalRefunded);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
  };
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2022-02-01" },
    [CHAIN.ARBITRUM]: { start: "2022-04-10" },
    [CHAIN.OPTIMISM]: { start: "2022-05-20" },
    [CHAIN.POLYGON]: { start: "2022-03-15" },
    [CHAIN.AVAX]: { start: "2022-03-15" },
    [CHAIN.BSC]: { start: "2022-03-15" },
    [CHAIN.BASE]: { start: "2023-07-15" },
    [CHAIN.FANTOM]: { start: "2022-03-15" },
    [CHAIN.LINEA]: { start: "2023-07-15" },
    [CHAIN.CELO]: { start: "2022-03-15" },
    [CHAIN.MANTLE]: { start: "2023-07-15" },
    [CHAIN.BLAST]: { start: "2024-02-20" },
    [CHAIN.MODE]: { start: "2024-01-20" },
    [CHAIN.SCROLL]: { start: "2023-10-10" },
  },
  methodology: {
    Fees: 'Total gas fees paid by users(excluding gas refunds)',
    Revenue: 'Axelar doesnt collect any fee'
  }
};

export default adapter;

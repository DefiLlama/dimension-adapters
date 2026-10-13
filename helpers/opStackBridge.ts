import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";

// Canonical bridges of OP-stack chains, Ethereum side (bridges/optimism-bridge.ts, base-bridge.ts, mode-bridge.ts, ...).
// One-sided: the L2 leg is attributed server-side from each listing's destination chain.
//  - ETH deposits: every deposit reaches the L2 through the OptimismPortal, directly or via the L1StandardBridge, and its
//    opaqueData starts with the ETH minted on L2 (abi.encodePacked(mint, value, gasLimit, isCreation, data))
//  - ETH withdrawals: the bridge's ETHWithdrawalFinalized (ETH withdrawn directly through the Portal carries no amount on L1)
//  - tokens: the bridge's ERC20DepositInitiated / ERC20WithdrawalFinalized, emitted before and after Bedrock
export type OpStackBridgeConfig = {
  name: string; // L2 name, for the methodology
  portal: string; // OptimismPortal (L1CrossDomainMessenger.portal())
  bridge: string; // L1StandardBridge
  start: string;
  // pre-Bedrock chains had no Portal: windows before this date read ETH deposits from the bridge's ETHDepositInitiated
  portalFrom?: string;
  // escrows holding bridged tokens outside the L1StandardBridge (custom token bridges); transfers in are deposits, out withdrawals
  escrows?: string[];
  // other contracts' ETH deposit events
  extraEthDeposits?: { target: string; eventAbi: string; amountArg: string }[];
  // Ethereum address of the L2 gas token when it isn't ETH
  gasToken?: string;
};

const fetchOpStack = async (options: FetchOptions, config: OpStackBridgeConfig) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  // ETH deposits
  const beforePortal = config.portalFrom && options.startTimestamp < Date.parse(`${config.portalFrom}T00:00:00Z`) / 1000;
  if (beforePortal) {
    const deposits = await options.getLogs({ target: config.bridge, eventAbi: "event ETHDepositInitiated(address indexed from, address indexed to, uint256 amount, bytes extraData)" });
    for (const { amount } of deposits) {
      dailyOutgoingVolume.addGasToken(amount);
      dailyOutgoingTxCount++;
    }
  } else {
    const deposits = await options.getLogs({ target: config.portal, eventAbi: "event TransactionDeposited(address indexed from, address indexed to, uint256 indexed version, bytes opaqueData)" });
    for (const { opaqueData } of deposits) {
      const mint = BigInt(ethers.dataSlice(opaqueData, 0, 32));
      const eth = config.gasToken ? BigInt(ethers.dataSlice(opaqueData, 64, 96)) : mint;
      if (!mint && !eth) continue;
      if (config.gasToken && mint) dailyOutgoingVolume.add(config.gasToken, mint);
      if (eth) dailyOutgoingVolume.addGasToken(eth);
      dailyOutgoingTxCount++;
    }
  }
  for (const { target, eventAbi, amountArg } of config.extraEthDeposits ?? []) {
    const deposits = await options.getLogs({ target, eventAbi });
    for (const deposit of deposits) {
      dailyOutgoingVolume.addGasToken(deposit[amountArg]);
      dailyOutgoingTxCount++;
    }
  }

  // ETH withdrawals
  const ethWithdrawals = await options.getLogs({ target: config.bridge, eventAbi: "event ETHWithdrawalFinalized(address indexed from, address indexed to, uint256 amount, bytes extraData)" });
  for (const { amount } of ethWithdrawals) {
    dailyIncomingVolume.addGasToken(amount);
    dailyIncomingTxCount++;
  }
  if (config.gasToken) {
    const gasTokenWithdrawals = await options.getLogs({ target: config.bridge, eventAbi: "event MNTWithdrawalFinalized(address indexed from, address indexed to, uint256 amount, bytes extraData)" });
    for (const { amount } of gasTokenWithdrawals) {
      dailyIncomingVolume.add(config.gasToken, amount);
      dailyIncomingTxCount++;
    }
  }

  // Token deposits and withdrawals through the bridge
  const tokenDeposits = await options.getLogs({ target: config.bridge, eventAbi: "event ERC20DepositInitiated(address indexed l1Token, address indexed l2Token, address indexed from, address to, uint256 amount, bytes extraData)" });
  for (const { l1Token, amount } of tokenDeposits) {
    dailyOutgoingVolume.add(l1Token, amount);
    dailyOutgoingTxCount++;
  }
  const tokenWithdrawals = await options.getLogs({ target: config.bridge, eventAbi: "event ERC20WithdrawalFinalized(address indexed l1Token, address indexed l2Token, address indexed from, address to, uint256 amount, bytes extraData)" });
  for (const { l1Token, amount } of tokenWithdrawals) {
    dailyIncomingVolume.add(l1Token, amount);
    dailyIncomingTxCount++;
  }

  // Token deposits and withdrawals through other escrows, skipping moves between them
  if (config.escrows?.length) {
    const escrows = new Set(config.escrows.map((e) => e.toLowerCase()));
    const fromBlock = await options.getFromBlock();
    const toBlock = await options.getToBlock();
    const deposits = await sdk.indexer.getTokenTransfers({ chain: options.chain, targets: config.escrows, transferType: "in", fromBlock, toBlock });
    const withdrawals = await sdk.indexer.getTokenTransfers({ chain: options.chain, targets: config.escrows, transferType: "out", fromBlock, toBlock });
    for (const t of deposits) {
      if (escrows.has(t.from_address.toLowerCase())) continue;
      dailyOutgoingVolume.add(t.token, t.value);
      dailyOutgoingTxCount++;
    }
    for (const t of withdrawals) {
      if (escrows.has(t.to_address.toLowerCase())) continue;
      dailyIncomingVolume.add(t.token, t.value);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

export const opStackBridgeExport = (config: OpStackBridgeConfig): SimpleAdapter => ({
  version: 2,
  pullHourly: true,
  fetch: (options: FetchOptions) => fetchOpStack(options, config),
  chains: [CHAIN.ETHEREUM],
  start: config.start,
  methodology: {
    OutgoingVolume: `Value of ETH and tokens deposited from Ethereum into ${config.name} through the canonical bridge and OptimismPortal.`,
    IncomingVolume: `Value of ETH and tokens withdrawn from ${config.name} through the canonical bridge and released on Ethereum. ETH withdrawn directly through the OptimismPortal is not included.`,
    OutgoingTxCount: `Number of deposits from Ethereum into ${config.name}.`,
    IncomingTxCount: `Number of withdrawals from ${config.name} released on Ethereum through the canonical bridge.`,
  },
});

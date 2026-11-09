import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "./chains";

// Canonical bridges of Arbitrum-stack chains (Arbitrum One, Orbit chains), parent-chain side; configs in factory/arbitrumBridges.ts.
// One-sided: the child chain's leg is attributed server-side from each listing's destination chain.
export type ArbitrumBridgeConfig = {
  name: string; // child chain name, for the methodology
  inbox: string; // delayed Inbox
  bridge: string;
  escrows: string[]; // token gateways / escrows holding bridged ERC20s
  // The Bridge records a contract sender with the L1->L2 alias (address + 0x1111000000000000000000000000000000001111).
  // The WETH gateway's retryables move the ETH of WETH deposits, which are counted as WETH sent to the gateway.
  // Chains without a WETH gateway (custom gas token chains, some ETH chains) leave it out.
  wethGatewayAlias?: string;
  // Custom gas token chains: the Bridge (ERC20Bridge.nativeToken()) holds that token instead of ETH, and deposits,
  // retryable call values and plain payouts are amounts of it
  nativeToken?: string;
  // L3s settle on an L2 instead of Ethereum
  parent?: { chain: string; name: string };
  start: string;
  excludedTokens?: string[]; // mispriced or fake tokens moved through the gateways, skipped entirely
};

// Bridge message kinds
const ETH_DEPOSIT = 12;
const RETRYABLE = 9;

const fetchArbitrumBridge = async (options: FetchOptions, config: ArbitrumBridgeConfig) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  // ETH deposits: the Inbox event carries the message data, the Bridge event its kind and sender
  const inboxMessages = await options.getLogs({ target: config.inbox, eventAbi: "event InboxMessageDelivered(uint256 indexed messageNum, bytes data)" });
  const bridgeMessages = await options.getLogs({
    target: config.bridge,
    eventAbi: "event MessageDelivered(uint256 indexed messageIndex, bytes32 indexed beforeInboxAcc, address inbox, uint8 kind, address sender, bytes32 messageDataHash, uint256 baseFeeL1, uint64 timestamp)",
  });
  const addNative = (balances: any, amount: bigint | string) => config.nativeToken ? balances.add(config.nativeToken, amount) : balances.addGasToken(amount);
  const wethGatewayAlias = config.wethGatewayAlias?.toLowerCase();
  const kindOf: Record<string, number> = {};
  const senderOf: Record<string, string> = {};
  bridgeMessages.forEach((m: any) => {
    kindOf[m.messageIndex] = Number(m.kind);
    senderOf[m.messageIndex] = m.sender.toLowerCase();
  });

  for (const { messageNum, data } of inboxMessages) {
    let amount: bigint | undefined;
    // ETH deposit: data is (destination address, amount)
    if (kindOf[messageNum] === ETH_DEPOSIT) amount = BigInt(ethers.dataSlice(data, 20, 52));
    // retryable ticket: the second word is the ETH delivered on L2 (l2CallValue)
    if (kindOf[messageNum] === RETRYABLE && senderOf[messageNum] !== wethGatewayAlias) amount = BigInt(ethers.dataSlice(data, 32, 64));
    if (!amount) continue;
    addNative(dailyOutgoingVolume, amount);
    dailyOutgoingTxCount++;
  }

  // ETH withdrawals: Bridge calls without calldata are plain ETH payouts (calls with data are gateway or contract executions)
  const bridgeCalls = await options.getLogs({ target: config.bridge, eventAbi: "event BridgeCallTriggered(address indexed outbox, address indexed to, uint256 value, bytes data)" });
  for (const { value, data } of bridgeCalls) {
    if (data !== "0x" || !BigInt(value)) continue;
    addNative(dailyIncomingVolume, value);
    dailyIncomingTxCount++;
  }

  // Token deposits and withdrawals: transfers into and out of the gateway escrows, skipping moves between them
  const escrows = new Set(config.escrows.map((e) => e.toLowerCase()));
  const excluded = new Set((config.excludedTokens ?? []).map((t) => t.toLowerCase()));
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const deposits = await sdk.indexer.getTokenTransfers({ chain: options.chain, targets: config.escrows, transferType: "in", fromBlock, toBlock });
  const withdrawals = await sdk.indexer.getTokenTransfers({ chain: options.chain, targets: config.escrows, transferType: "out", fromBlock, toBlock });
  for (const t of deposits) {
    if (escrows.has(t.from_address.toLowerCase()) || excluded.has(t.token.toLowerCase())) continue;
    dailyOutgoingVolume.add(t.token, t.value);
    dailyOutgoingTxCount++;
  }
  for (const t of withdrawals) {
    if (escrows.has(t.to_address.toLowerCase()) || excluded.has(t.token.toLowerCase())) continue;
    dailyIncomingVolume.add(t.token, t.value);
    dailyIncomingTxCount++;
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

/**
 * Bridge adapter for an Arbitrum-stack (Nitro) chain's canonical bridge, read on its parent chain only (Ethereum unless
 * `parent` is set): gas token deposits and retryables from the Inbox, gas token withdrawals from Bridge calls without
 * calldata, and token transfers through the gateway escrows. The child chain's leg is attributed server-side from the
 * listing's destination chain.
 */
export const arbitrumBridgeExport = (config: ArbitrumBridgeConfig): SimpleAdapter => {
  const parent = config.parent?.name ?? "Ethereum";
  const gasToken = config.nativeToken ? "its gas token" : "ETH";
  return {
    version: 2,
    pullHourly: true,
    fetch: (options: FetchOptions) => fetchArbitrumBridge(options, config),
    chains: [config.parent?.chain ?? CHAIN.ETHEREUM],
    start: config.start,
    methodology: {
      OutgoingVolume: `Value of ${gasToken} and tokens deposited from ${parent} into ${config.name} through the canonical bridge.`,
      IncomingVolume: `Value of ${gasToken} and tokens withdrawn from ${config.name} and released on ${parent} through the canonical bridge.`,
      OutgoingTxCount: `Number of deposits from ${parent} into ${config.name} through the canonical bridge.`,
      IncomingTxCount: `Number of withdrawals from ${config.name} released on ${parent} through the canonical bridge.`,
    },
  };
};

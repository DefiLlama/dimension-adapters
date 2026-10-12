import * as sdk from "@defillama/sdk";
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Arbitrum One canonical bridge, Ethereum side. One-sided: the Arbitrum leg is attributed server-side (destinationChain: arbitrum).
// https://docs.arbitrum.io/build-decentralized-apps/reference/contract-addresses
const DELAYED_INBOX = "0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f";
const BRIDGE = "0x8315177aB297bA92A06054cE80a67Ed4DBd7ed3a";
const ESCROWS = [
  "0xa3A7B6F88361F48403514059F1F16C8E78d60EeC", // L1 ERC20 gateway
  "0xcEe284F754E854890e311e3280b767F80797180d", // L1 custom gateway
  "0xd92023E9d9911199a6711321D1277285e6d4e2db", // L1 WETH gateway
  "0xA10c7CE4b876998858b1a9E12b10092229539400", // DAI L1 escrow
];
// Bridge message kinds
const ETH_DEPOSIT = 12;
const RETRYABLE = 9;
// The Bridge records a contract sender with Arbitrum's L1->L2 alias (address + 0x1111000000000000000000000000000000001111).
// This is the L1 WETH gateway's alias: its retryables move the ETH of WETH deposits, which are counted as WETH sent to the gateway.
const WETH_GATEWAY_ALIAS = "0xea3123e9d9911199a6711321d1277285e6d4f3ec";

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  // ETH deposits: the Inbox event carries the message data, the Bridge event its kind and sender
  const inboxMessages = await options.getLogs({ target: DELAYED_INBOX, eventAbi: "event InboxMessageDelivered(uint256 indexed messageNum, bytes data)" });
  const bridgeMessages = await options.getLogs({
    target: BRIDGE,
    eventAbi: "event MessageDelivered(uint256 indexed messageIndex, bytes32 indexed beforeInboxAcc, address inbox, uint8 kind, address sender, bytes32 messageDataHash, uint256 baseFeeL1, uint64 timestamp)",
  });
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
    // retryable ticket: the second word is the ETH delivered on Arbitrum (l2CallValue)
    if (kindOf[messageNum] === RETRYABLE && senderOf[messageNum] !== WETH_GATEWAY_ALIAS) amount = BigInt(ethers.dataSlice(data, 32, 64));
    if (!amount) continue;
    dailyOutgoingVolume.addGasToken(amount);
    dailyOutgoingTxCount++;
  }

  // ETH withdrawals: Bridge calls without calldata are plain ETH payouts (calls with data are gateway or contract executions)
  const bridgeCalls = await options.getLogs({ target: BRIDGE, eventAbi: "event BridgeCallTriggered(address indexed outbox, address indexed to, uint256 value, bytes data)" });
  for (const { value, data } of bridgeCalls) {
    if (data !== "0x" || !BigInt(value)) continue;
    dailyIncomingVolume.addGasToken(value);
    dailyIncomingTxCount++;
  }

  // Token deposits and withdrawals: transfers into and out of the gateway escrows, skipping moves between them
  const escrows = new Set(ESCROWS.map((e) => e.toLowerCase()));
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const deposits = await sdk.indexer.getTokenTransfers({ chain: options.chain, targets: ESCROWS, transferType: "in", fromBlock, toBlock });
  const withdrawals = await sdk.indexer.getTokenTransfers({ chain: options.chain, targets: ESCROWS, transferType: "out", fromBlock, toBlock });
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

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2022-10-17", // first day the old bridges server recorded Arbitrum volume
  methodology: {
    OutgoingVolume: "Value of ETH and tokens deposited from Ethereum into Arbitrum One through the canonical bridge.",
    IncomingVolume: "Value of ETH and tokens withdrawn from Arbitrum One and released on Ethereum through the canonical bridge.",
    OutgoingTxCount: "Number of deposits from Ethereum into Arbitrum One through the canonical bridge.",
    IncomingTxCount: "Number of withdrawals from Arbitrum One released on Ethereum through the canonical bridge.",
  },
};

export default adapter;

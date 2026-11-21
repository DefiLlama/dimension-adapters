import ADDRESSES from '../helpers/coreAssets.json'
import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTransactionsWithRetry } from "../helpers/getTxReceipts";

// Snowbridge (Ethereum <-> Polkadot), Ethereum side: one-sided, the Polkadot leg is attributed server-side
// (destinationChain: polkadot). Gateway v1 and v2 are both live on the same proxy.
// Contract sources: https://github.com/Snowfork/snowbridge/tree/main/contracts/src
//  - outgoing: v1 TokenSent (token, amount); v2 OutboundMessageAccepted, whose payload lists the ERC20 assets
//    (native tokens by address, Polkadot tokens by foreign id) and the ETH sent (`value`, not counting fees)
//  - incoming: the Gateway emits no amounts, so the relayed message is decoded from the submit call (sent through
//    Multicall3 by the relayers) and its UnlockNativeToken / MintForeignToken commands are counted when dispatched
//    successfully (v1 by message id, v2 by nonce, skipping commands reported by CommandFailed)
const GATEWAY = "0x27ca963c279c93801941e1eb8799c23f407d68e7";
const NATIVE = ADDRESSES.null;

const TOKEN_SENT_V1 = "event TokenSent(address indexed token, address indexed sender, uint32 indexed destinationChain, (uint8 kind, bytes data) destinationAddress, uint128 amount)";
const OUTBOUND_V2 = "event OutboundMessageAccepted(uint64 nonce, (address origin, (uint8 kind, bytes data)[] assets, (uint8 kind, bytes data) xcm, bytes claimer, uint128 value, uint128 executionFee, uint128 relayerFee) payload)";
const DISPATCHED_V1 = "event InboundMessageDispatched(bytes32 indexed channelID, uint64 nonce, bytes32 indexed messageID, bool success)";
const DISPATCHED_V2 = "event InboundMessageDispatched(uint64 indexed nonce, bytes32 topic, bool success, bytes32 rewardAddress)";
const COMMAND_FAILED_V2 = "event CommandFailed(uint64 indexed nonce, uint256 index)";

const calls = new ethers.Interface([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls)",
]);
// only the message (first argument) of the submit calls is decoded, the proofs are skipped
const MESSAGE_V1 = "tuple(bytes32 channelID, uint64 nonce, uint8 command, bytes params, uint64 maxDispatchGas, uint256 maxFeePerGas, uint256 reward, bytes32 id)";
const MESSAGE_V2 = "tuple(bytes32 origin, uint64 nonce, bytes32 topic, (uint8 kind, uint64 gas, bytes payload)[] commands)";
// Verification.Proof: (ParachainHeader, HeadProof, MMRLeafPartial, bytes32[] leafProof, uint256 leafProofOrder)
const PROOF = "((bytes32,uint256,bytes32,bytes32,(uint256,bytes4,bytes)[]),(uint256,uint256,bytes32[]),(uint8,uint32,bytes32,uint64,uint32,bytes32),bytes32[],uint256)";
const SUBMIT_V1 = ethers.id(`submitV1((bytes32,uint64,uint8,bytes,uint64,uint256,uint256,bytes32),bytes32[],${PROOF})`).slice(0, 10); // 0xdf4ed829
const SUBMIT_V2 = ethers.id(`v2_submit((bytes32,uint64,bytes32,(uint8,uint64,bytes)[]),bytes32[],${PROOF},bytes32)`).slice(0, 10); // 0xde469bc7
const coder = ethers.AbiCoder.defaultAbiCoder();

// v1 commands (enum Command) and v2 commands (CommandKind)
const V1_AGENT_EXECUTE = 0, V1_UNLOCK = 9, V1_MINT_FOREIGN = 11;
const V2_UNLOCK = 2, V2_MINT_FOREIGN = 4;

type Transfer = { token?: string; foreignId?: string; amount: bigint };

// gateway submit calls of a relayer transaction: direct, or wrapped in Multicall3 aggregate3
const gatewayCalls = (tx: any): string[] => {
  if (String(tx.to).toLowerCase() === GATEWAY) return [tx.data];
  const { name, args } = calls.parseTransaction({ data: tx.data }) ?? {};
  if (name !== "aggregate3") throw new Error(`snowbridge: unknown relayer call in ${tx.hash}`);
  return [...args![0]].filter((c: any) => String(c.target).toLowerCase() === GATEWAY).map((c: any) => c.callData);
};

const v1Transfer = (command: number, params: string): Transfer | null => {
  if (command === V1_UNLOCK) {
    const [, token, , amount] = coder.decode(["bytes32", "address", "address", "uint128"], params);
    return { token, amount };
  }
  if (command === V1_MINT_FOREIGN) {
    const [foreignId, , amount] = coder.decode(["bytes32", "address", "uint128"], params);
    return { foreignId, amount };
  }
  if (command === V1_AGENT_EXECUTE) {
    // deprecated: AgentExecuteParams(agentID, payload), payload = (AgentExecuteCommand.TransferToken, (token, recipient, amount))
    const [, payload] = coder.decode(["bytes32", "bytes"], params);
    const [, data] = coder.decode(["uint8", "bytes"], payload);
    const [token, , amount] = coder.decode(["address", "address", "uint128"], data);
    return { token, amount };
  }
  return null;
};

const v2Transfer = (kind: number, payload: string): Transfer | null => {
  if (kind === V2_UNLOCK) {
    const [token, , amount] = coder.decode(["address", "address", "uint128"], payload);
    return { token, amount };
  }
  if (kind === V2_MINT_FOREIGN) {
    const [foreignId, , amount] = coder.decode(["bytes32", "address", "uint128"], payload);
    return { foreignId, amount };
  }
  return null;
};

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;
  const foreignIds = new Set<string>();
  const outgoing: Transfer[] = [];
  const incoming: Transfer[] = [];

  // outgoing
  for (const { token, amount } of await options.getLogs({ target: GATEWAY, eventAbi: TOKEN_SENT_V1 })) {
    outgoing.push({ token, amount: BigInt(amount) });
    dailyOutgoingTxCount++;
  }
  for (const { payload } of await options.getLogs({ target: GATEWAY, eventAbi: OUTBOUND_V2 })) {
    const transfers: Transfer[] = [...payload.assets].map((asset: any) => {
      if (Number(asset.kind) === 0) {
        const [token, amount] = coder.decode(["address", "uint128"], asset.data);
        return { token, amount: BigInt(amount) };
      }
      const [foreignId, amount] = coder.decode(["bytes32", "uint128"], asset.data);
      return { foreignId, amount: BigInt(amount) };
    });
    if (BigInt(payload.value) > 0n) transfers.push({ token: NATIVE, amount: BigInt(payload.value) });
    if (!transfers.length) continue; // messages without assets or ETH (arbitrary calls)
    outgoing.push(...transfers);
    dailyOutgoingTxCount++;
  }

  // incoming: successfully dispatched messages, decoded from their relayer transactions
  const dispatchedV1 = await options.getLogs({ target: GATEWAY, eventAbi: DISPATCHED_V1, entireLog: true, parseLog: true });
  const dispatchedV2 = await options.getLogs({ target: GATEWAY, eventAbi: DISPATCHED_V2, entireLog: true, parseLog: true });
  const failedV2 = await options.getLogs({ target: GATEWAY, eventAbi: COMMAND_FAILED_V2, entireLog: true, parseLog: true });
  // keyed by transaction: a relayer batch can carry a submit for a message already dispatched by another relayer, which
  // fails inside the batch (allowFailure) while the batch succeeds; only the transaction that dispatched it counts it
  const txKey = (l: any, id: any) => `${String(l.transactionHash).toLowerCase()}-${String(id).toLowerCase()}`;
  const okV1 = new Set(dispatchedV1.filter((l: any) => l.args.success).map((l: any) => txKey(l, l.args.messageID)));
  const okV2 = new Set(dispatchedV2.filter((l: any) => l.args.success).map((l: any) => txKey(l, l.args.nonce)));
  const failedCommands = new Set(failedV2.map((l: any) => txKey(l, `${l.args.nonce}-${l.args.index}`)));
  const txHashes = [...new Set([...dispatchedV1, ...dispatchedV2].map((l: any) => l.transactionHash))];
  const txs = await getTransactionsWithRetry(CHAIN.ETHEREUM, txHashes);

  for (const [i, tx] of txs.entries()) {
    if (!tx) throw new Error(`snowbridge: transaction ${txHashes[i]} not found`);
    const inTx = { transactionHash: txHashes[i] };
    for (const data of gatewayCalls(tx)) {
      const selector = data.slice(0, 10), args = "0x" + data.slice(10);
      if (selector === SUBMIT_V1) {
        const [message] = coder.decode([MESSAGE_V1], args);
        if (!okV1.has(txKey(inTx, message.id))) continue;
        const transfer = v1Transfer(Number(message.command), message.params);
        if (transfer) { incoming.push(transfer); dailyIncomingTxCount++; }
      } else if (selector === SUBMIT_V2) {
        const [message] = coder.decode([MESSAGE_V2], args);
        if (!okV2.has(txKey(inTx, message.nonce))) continue;
        const transfers = [...message.commands]
          .map((c: any, index: number) => failedCommands.has(txKey(inTx, `${message.nonce}-${index}`)) ? null : v2Transfer(Number(c.kind), c.payload))
          .filter(Boolean) as Transfer[];
        if (transfers.length) { incoming.push(...transfers); dailyIncomingTxCount++; }
      }
    }
  }

  // Polkadot-native tokens are ERC20s deployed by the Gateway, resolved from their foreign id
  for (const t of [...outgoing, ...incoming]) if (t.foreignId) foreignIds.add(t.foreignId);
  const ids = [...foreignIds];
  const addresses = await options.api.multiCall({ target: GATEWAY, abi: "function tokenAddressOf(bytes32) view returns (address)", calls: ids });
  const tokenOf = Object.fromEntries(ids.map((id, i) => [id, addresses[i]]));

  const add = (balances: any, t: Transfer) => {
    const token = t.token ?? tokenOf[t.foreignId!];
    if (token === NATIVE) balances.addGasToken(t.amount);
    else balances.add(token, t.amount);
  };
  for (const t of outgoing) add(dailyOutgoingVolume, t);
  for (const t of incoming) add(dailyIncomingVolume, t);

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2025-11-14", // first day the old bridges server recorded Snowbridge volume
  methodology: {
    OutgoingVolume: "Value of tokens and ETH sent from Ethereum to Polkadot through the Snowbridge Gateway, excluding bridge fees.",
    IncomingVolume: "Value of tokens and ETH released or minted on Ethereum by successfully dispatched Snowbridge messages from Polkadot.",
    OutgoingTxCount: "Number of Snowbridge transfers sent from Ethereum.",
    IncomingTxCount: "Number of Snowbridge messages from Polkadot that released or minted tokens on Ethereum.",
  },
};

export default adapter;

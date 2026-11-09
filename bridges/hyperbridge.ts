import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";

// Hyperbridge, same contracts on every chain (CREATE2): https://docs.hyperbridge.network/developers/evm/contract-addresses/mainnet
// Two sources, ported from the bridges-server adapter:
// - IntentGateway orders: OrderPlaced inputs leave the chain (outgoing), OrderFilled / PartialFill outputs arrive (incoming)
// - every other app on the ISMP host (token gateways, HyperFungibleTokens, third parties): in a tx that dispatches a
//   request, transfers into a dispatching module or burns are outgoing; in a tx that handles one, transfers out of a
//   contract in that tx or mints are incoming. IntentGateway txs and fee transfers to the host/handler are skipped.
const ISMP_HOST = "0x620128E2B19193d6Bd244a3AC8D3bBa0541B19c3";
const HANDLER = "0x2a18AB35DEa43474882E05A661e2F20fe89c0535";
const INTENT_GATEWAY = "0xAe041F7B0CB581876832830baeB6a2Aa2a3C9716";

const ZERO = ADDRESSES.null;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TOKEN_INFO = "tuple(bytes32 token, uint256 amount)[]";

const ISMP_OUTGOING = [
  "event PostRequestEvent(string source, string dest, address indexed from, bytes to, uint256 nonce, uint256 timeoutTimestamp, bytes body, uint256 fee)",
  "event GetRequestEvent(string source, string dest, bytes from, bytes[] keys, uint256 height, uint256 nonce, uint256 timeoutTimestamp, bytes context, uint256 fee)",
];
const ISMP_INCOMING = [
  "event PostRequestHandled(bytes32 indexed commitment, address relayer)",
  "event GetRequestHandled(bytes32 indexed commitment, address relayer)",
  "event PostRequestTimeoutHandled(bytes32 indexed commitment, string dest)",
  "event GetRequestTimeoutHandled(bytes32 indexed commitment, string dest)",
];
const ORDER_PLACED = [
  `event OrderPlaced(bytes32 user, string source, string destination, uint256 deadline, uint256 nonce, uint256 fees, address session, bytes32 beneficiary, ${TOKEN_INFO} predispatch, ${TOKEN_INFO} inputs, ${TOKEN_INFO} outputs, bytes predispatchCall, bytes outputCall, bytes32 graffiti)`,
  // emitted by the same proxy before the 2026-08-08 implementation upgrade
  `event OrderPlaced(bytes32 user, string source, string destination, uint256 deadline, uint256 nonce, uint256 fees, address session, bytes32 beneficiary, ${TOKEN_INFO} predispatch, ${TOKEN_INFO} inputs, ${TOKEN_INFO} outputs)`,
];
const ORDER_FILLED = [
  `event OrderFilled(bytes32 indexed commitment, address filler, ${TOKEN_INFO} outputs, ${TOKEN_INFO} inputs)`,
  `event PartialFill(bytes32 indexed commitment, address filler, ${TOKEN_INFO} outputs, ${TOKEN_INFO} inputs)`,
];

const bytes32ToAddress = (b: string) => "0x" + b.slice(-40).toLowerCase(); // address(0) = native token
const topicToAddress = (t: string) => "0x" + t.slice(26).toLowerCase();

const getAllLogs = async (options: FetchOptions, target: string, abis: string[]) =>
  (await Promise.all(abis.map((eventAbi) => options.getLogs({ target, eventAbi, onlyArgs: false })))).flat();

const fetch = async (options: FetchOptions) => {
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  // IntentGateway orders
  for (const log of await getAllLogs(options, INTENT_GATEWAY, ORDER_PLACED)) {
    for (const { token, amount } of log.args.inputs) if (BigInt(amount) > 0n) dailyOutgoingVolume.add(bytes32ToAddress(token), amount);
    dailyOutgoingTxCount++;
  }
  for (const log of await getAllLogs(options, INTENT_GATEWAY, ORDER_FILLED)) {
    for (const { token, amount } of log.args.outputs) if (BigInt(amount) > 0n) dailyIncomingVolume.add(bytes32ToAddress(token), amount);
    dailyIncomingTxCount++;
  }

  // ISMP txs, grouped by tx with the modules that dispatched from them
  const txs = new Map<string, { outgoing: boolean; modules: Set<string> }>();
  const txOf = (hash: string) => {
    if (!txs.has(hash)) txs.set(hash, { outgoing: false, modules: new Set() });
    return txs.get(hash)!;
  };
  for (const log of await getAllLogs(options, ISMP_HOST, ISMP_INCOMING)) txOf(log.transactionHash.toLowerCase());
  for (const log of await getAllLogs(options, ISMP_HOST, ISMP_OUTGOING)) {
    const tx = txOf(log.transactionHash.toLowerCase());
    tx.outgoing = true;
    const from = String(log.args.from);
    if (from.length === 42) tx.modules.add(from.toLowerCase());
  }

  const intentGateway = INTENT_GATEWAY.toLowerCase();
  const skip = new Set([ISMP_HOST, HANDLER, INTENT_GATEWAY].map((a) => a.toLowerCase()));
  const hashes = [...txs.entries()].filter(([, tx]) => !(tx.outgoing && [...tx.modules].every((m) => m === intentGateway))).map(([hash]) => hash);
  const receipts = await getTxReceiptsWithRetry(options.chain, hashes);

  receipts.forEach((receipt, i) => {
    if (!receipt) throw new Error(`hyperbridge: no receipt for ${hashes[i]} on ${options.chain}`);
    const tx = txs.get(hashes[i])!;
    if (receipt.logs.some((l) => l.address.toLowerCase() === intentGateway)) return;
    const contracts = new Set(receipt.logs.map((l) => l.address.toLowerCase()));
    let counted = false;

    for (const log of receipt.logs) {
      if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
      const from = topicToAddress(log.topics[1]);
      const to = topicToAddress(log.topics[2]);
      const amount = BigInt(log.data);
      if (amount === 0n || skip.has(from) || skip.has(to)) continue;
      if (tx.outgoing) {
        if (to !== ZERO && !tx.modules.has(to)) continue;
        dailyOutgoingVolume.add(log.address, amount);
      } else {
        if (from !== ZERO && !contracts.has(from)) continue;
        dailyIncomingVolume.add(log.address, amount);
      }
      counted = true;
    }
    if (counted) tx.outgoing ? dailyOutgoingTxCount++ : dailyIncomingTxCount++;
  });

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.OPTIMISM, CHAIN.BASE, CHAIN.BSC, CHAIN.POLYGON],
  methodology: {
    OutgoingVolume: "Value of tokens leaving each chain through Hyperbridge: IntentGateway order inputs, and tokens sent or burned by apps dispatching cross-chain requests through the ISMP host.",
    IncomingVolume: "Value of tokens arriving on each chain through Hyperbridge: IntentGateway order fills, and tokens released or minted when the ISMP host handles an incoming request.",
    OutgoingTxCount: "Number of IntentGateway orders and ISMP transfers sent from each chain.",
    IncomingTxCount: "Number of IntentGateway fills and ISMP transfers received on each chain.",
  },
};

export default adapter;

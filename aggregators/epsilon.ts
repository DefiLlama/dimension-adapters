import { Interface, ZeroAddress } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTransactionsWithRetry, getTxReceiptsWithRetry } from "../helpers/getTxReceipts";

// Epsilon v6 router on Base, the order and swap engine of the Alien Base app.
const ROUTER = "0x303ca5c65aabcb1ce242df93f478c41e0e4d2580";
// router.feeCollector() (checked 2026-11-10): receives the protocol fee (router.protocolFeeBps() = 5, i.e. 0.05% on every
// swap and fill), the matching fee on matched legs and the protocol share of captured surplus. An Epsilon-owned EOA.
const FEE_COLLECTOR = "0x7b7a3028acccc4a22767b0853d72afbfdb4032dd";

const SWAPPED =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)";
// limit, stop-loss, DCA, trailing-stop and trusted executions; `keeper` is the keeper fee recipient
const ORDER_FILLED =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed keeper, uint256 amountIn, uint256 amountOut, uint256 remaining)";

const erc20Interface = new Interface([
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const TRANSFER_TOPIC = erc20Interface.getEvent("Transfer")!.topicHash;

// Keeper calls on the router pass struct Order { uint256 salt; address maker; address receiver; address tokenIn; address tokenOut;
// uint256 amountIn; uint256 triggerPrice; uint256 makerTraits; address referrer; uint16 referralFeeBps } as the first, static
// argument. Only the receiver and referrer are read from it, and only when the tx calls the router directly with this order.
const structAddr = (input: string, word: number): string =>
  "0x" + input.slice(2 + (4 + word * 32) * 2 + 24, 2 + (4 + word * 32) * 2 + 64).toLowerCase();
const MAKER_WORD = 1;
const RECEIVER_WORD = 2;
const REFERRER_WORD = 8;
const MIN_INPUT_LEN = 2 + (4 + (REFERRER_WORD + 1) * 32) * 2;

const METRIC = {
  DIRECT_SWAPS: "Direct Swaps",
  ORDER_FILLS: "Order Fills",
  PROTOCOL_FEES: "Protocol Fees",
  KEEPER_FEES: "Keeper Fees",
  REFERRAL_FEES: "Referral Fees",
};

type Transfer = { token: string; from: string; to: string; amount: bigint };
type TxMeta = {
  keepers: Set<string>;
  referrers: Set<string>;
  // trade payout recipients (maker, receiver, swap user): never fees, even when one is also the keeper or referrer
  payouts: Set<string>;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const swaps: any[] = await options.getLogs({ target: ROUTER, eventAbi: SWAPPED, entireLog: true, parseLog: true });
  const fills: any[] = await options.getLogs({ target: ROUTER, eventAbi: ORDER_FILLED, entireLog: true, parseLog: true });

  const txMeta = new Map<string, TxMeta>();
  const meta = (txHash: string): TxMeta => {
    const key = txHash.toLowerCase();
    if (!txMeta.has(key)) txMeta.set(key, { keepers: new Set(), referrers: new Set(), payouts: new Set() });
    return txMeta.get(key)!;
  };
  for (const log of [...swaps, ...fills]) meta(log.transactionHash);

  const txHashes = [...txMeta.keys()];
  if (!txHashes.length) return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };

  const receipts = await getTxReceiptsWithRetry(options.chain, txHashes);
  const transfersByTx: Record<string, Transfer[]> = {};
  txHashes.forEach((hash, i) => {
    const receipt = receipts[i];
    if (!receipt) throw new Error(`Missing receipt for Epsilon tx ${hash}`);
    transfersByTx[hash] = [];
    for (const log of receipt.logs ?? []) {
      // ERC721 Transfer shares the topic but has 4 topics
      if (log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
      const parsed = erc20Interface.parseLog(log as any)!;
      transfersByTx[hash].push({
        token: log.address.toLowerCase(),
        from: String(parsed.args.from).toLowerCase(),
        to: String(parsed.args.to).toLowerCase(),
        amount: parsed.args.value,
      });
    }
  });

  // 1) Direct swaps: the event carries the pair; the protocol fee is taken in tokenIn
  for (const s of swaps) {
    dailyVolume.add(s.args.tokenIn, s.args.amountIn, METRIC.DIRECT_SWAPS);
    meta(s.transactionHash).payouts.add(String(s.args.user).toLowerCase());
  }

  // 2) Order fills: amountIn is the filled slice. The router pulls exactly that amount of tokenIn from the maker in the same tx,
  //    so tokenIn is read from that transfer whatever contract called the router (keeper EOA, executeTrusted, Matcher overflow leg).
  if (fills.length) {
    const fillTxHashes = [...new Set(fills.map((log) => log.transactionHash.toLowerCase()))];
    const txs = await getTransactionsWithRetry(options.chain, fillTxHashes);
    const inputByTx: Record<string, string> = {};
    fillTxHashes.forEach((hash, i) => {
      if (!txs[i]) throw new Error(`Missing transaction for Epsilon fill tx ${hash}`);
      if (txs[i]!.to?.toLowerCase() === ROUTER) inputByTx[hash] = txs[i]!.data ?? "0x";
    });

    for (const log of fills) {
      const txHash = log.transactionHash.toLowerCase();
      const maker = String(log.args.maker).toLowerCase();
      const amountIn = BigInt(log.args.amountIn);
      const pulls = transfersByTx[txHash].filter((t) => t.from === maker && t.to === ROUTER);
      const pullTokens = [...new Set(pulls.map((t) => t.token))];
      const tokenIn = pulls.find((t) => t.amount === amountIn)?.token ?? (pullTokens.length === 1 ? pullTokens[0] : undefined);
      if (!tokenIn) throw new Error(`Epsilon fill in tx ${txHash}: no tokenIn transfer from maker ${maker} to the router`);
      dailyVolume.add(tokenIn, amountIn, METRIC.ORDER_FILLS);

      const m = meta(txHash);
      m.keepers.add(String(log.args.keeper).toLowerCase());
      m.payouts.add(maker);
      // referral legs are attributable only when the order is the router call's own argument; Alien Base orders carry no referral
      const input = inputByTx[txHash];
      if (input && input.length >= MIN_INPUT_LEN && structAddr(input, MAKER_WORD) === maker) {
        m.payouts.add(structAddr(input, RECEIVER_WORD));
        m.referrers.add(structAddr(input, REFERRER_WORD));
      }
    }
  }

  // 3) Fee legs: every fee is an ERC20 transfer out of the router in the trade tx. Routing legs and trade payouts are ignored
  //    because only known fee recipients are counted.
  for (const hash of txHashes) {
    const m = txMeta.get(hash)!;
    for (const { token, from, to, amount } of transfersByTx[hash]) {
      if (from !== ROUTER || m.payouts.has(to)) continue;
      if (to === FEE_COLLECTOR) {
        dailyFees.add(token, amount, METRIC.PROTOCOL_FEES);
        dailyRevenue.add(token, amount, METRIC.PROTOCOL_FEES);
      } else if (m.keepers.has(to)) {
        dailyFees.add(token, amount, METRIC.KEEPER_FEES);
        dailySupplySideRevenue.add(token, amount, METRIC.KEEPER_FEES);
      } else if (m.referrers.has(to) && to !== ZeroAddress) {
        dailyFees.add(token, amount, METRIC.REFERRAL_FEES);
        dailySupplySideRevenue.add(token, amount, METRIC.REFERRAL_FEES);
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Sum of direct swaps and order fills (limit, stop-loss, DCA and trailing-stop executions) routed through the Epsilon router of Alien Base on Base, valued on the input token. Ring-matched legs settled peer to peer by the Epsilon matcher emit no fill event and are not counted.",
  Fees: "All fees charged on trades, measured from token transfers out of the router: the 0.05% protocol fee on every swap and fill (plus matching fees and captured surplus), keeper execution fees and referral fees.",
  Revenue: "The protocol fee, matching fees and captured surplus, all sent to the Epsilon fee collector.",
  ProtocolRevenue: "The protocol fee, matching fees and captured surplus, all kept by the Epsilon fee collector; there is no token distribution.",
  SupplySideRevenue: "Execution fees paid to the keepers that fill orders and referral fees paid to the referrer named on an order.",
};

const breakdownMethodology = {
  Volume: {
    [METRIC.DIRECT_SWAPS]: "Market swaps executed directly through the router (Swapped events), valued on the input token.",
    [METRIC.ORDER_FILLS]: "Keeper executions of limit, stop-loss, DCA and trailing-stop orders (OrderFilled events), valued on the input token.",
  },
  Fees: {
    [METRIC.PROTOCOL_FEES]: "0.05% protocol fee on every swap and fill, matching fees and the protocol share of captured surplus, transferred to the fee collector.",
    [METRIC.KEEPER_FEES]: "Execution fee (set per order type and token tier) paid to the keeper that fills an order.",
    [METRIC.REFERRAL_FEES]: "Referral fee paid to the referrer named on the order.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fee, matching fees and captured surplus kept by the fee collector.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fee, matching fees and captured surplus kept by the fee collector.",
  },
  SupplySideRevenue: {
    [METRIC.KEEPER_FEES]: "Execution fees earned by keepers for filling orders.",
    [METRIC.REFERRAL_FEES]: "Referral fees earned by order referrers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  fetch,
  start: "2026-05-19",
  methodology,
  breakdownMethodology,
};

export default adapter;

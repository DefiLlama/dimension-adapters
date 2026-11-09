/**
 * TRDEFI — protocol fees
 *
 * TRDEFI is a non-custodial venue for stablecoin market-making positions. Creating a
 * position through it embeds a 0.05% protocol fee inside the maker's signed order, and
 * that fee is paid to a single receiver address when the position trades. So the fee is
 * not invoiced, and it is not a balance sheet item: it arrives as an ordinary token
 * transfer, which is what this adapter reads.
 *
 * Why the numbers can look small or absent, which a reviewer will ask:
 *   • The fee rail was armed on 2026-09-25. Positions created before that carry no fee
 *     and are immutable on-chain, so their volume is real but earns us nothing. The
 *     `start` date below is the armed date, not the date the protocol launched.
 *   • We are not the underlying protocol. The positions live in a public liquidity
 *     registry that another venue also uses, and that protocol is listed separately on
 *     DefiLlama with its own volume. This adapter counts only the fee TRDEFI itself
 *     collects — a distinct, on-chain-verifiable revenue stream — and deliberately does
 *     not restate anyone else's volume. That is why a fee-to-volume ratio computed
 *     against the underlying protocol's TVL or volume would not be meaningful here.
 *   • A zero day is therefore expected and correct whenever no fee-bearing position
 *     trades.
 *
 * Fees are counted in the token they arrive in (USDC, USDT, EURC), as incoming
 * transfers to the receiver, which is the fee exactly as collected.
 *
 * Only transfers that the swap execution path itself originates are counted. The fee
 * is moved by the Aqua registry, which pulls it from the maker's Aqua balance to the
 * receiver inside the venue router's swap call. An ERC-20 Transfer records the token
 * owner, so that transfer's `from` is the MAKER, not the registry — a plain `from`
 * allowlist cannot express this. Instead each candidate transfer to the receiver is
 * correlated 1:1 with an Aqua `Pulled` event (app = router, same tx, token, maker
 * and amount). Each pull is consumed, so it cannot count a second transfer. A third
 * party sending a token to the receiver emits no such pull, so it is not counted.
 */
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const FEE_RECEIVER = "0x4C96dA02d7120BFb81594d0e924B237e0c74660d";

// Positions live in the public Aqua liquidity registry and a swap against them
// executes through the venue router. The fee is an Aqua `pull`, so a genuine fee
// transfer is one that has a matching `Pulled` event from the registry in the same
// transaction, with the router as the app.
const AQUA_REGISTRY = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a";
const ROUTER = "0x111111338c5091e8440b67b168bae16a668ac0de";

const TRANSFER_EVENT =
  "event Transfer (address indexed from, address indexed to, uint256 amount)";
const PULLED_EVENT =
  "event Pulled (address maker, address app, bytes32 strategyHash, address token, uint256 amount)";

// topic0 must be pinned. Leaving it null lets the indexer decode any log whose
// topic1/topic2 happen to line up (an Approval(owner, spender, value) reads as a
// Transfer) into an `amount` this adapter would count as a fee.
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const PULLED_TOPIC =
  "0x3ad61047071575417c75e3311e5d46ff042e292b5dd8769ff18b4b254098ca7a";

// The fee rail was armed here. Adapters must not claim fees before they were charged.
const ARMED = "2026-09-25";

const topic = (address: string) =>
  "0x" + address.slice(2).toLowerCase().padStart(64, "0");
const lower = (v: any) => String(v).toLowerCase();
const txHashOf = (log: any) =>
  lower(log.transactionHash ?? log.transaction_hash ?? log.txHash ?? "");

// The tokens a position can be denominated in, per chain. Reading transfers against a
// known token set keeps the query targetable, rather than scanning every Transfer in a
// block.
const TOKENS: Record<string, string[]> = {
  [CHAIN.ETHEREUM]: [ADDRESSES.ethereum.USDC, ADDRESSES.ethereum.USDT],
  [CHAIN.BASE]: [ADDRESSES.base.USDC, ADDRESSES.base.USDT],
  [CHAIN.ARBITRUM]: [ADDRESSES.arbitrum.USDC_CIRCLE, ADDRESSES.arbitrum.USDT],
  [CHAIN.OPTIMISM]: [ADDRESSES.optimism.USDC_CIRCLE, ADDRESSES.optimism.USDT],
  [CHAIN.POLYGON]: [ADDRESSES.polygon.USDC_CIRCLE, ADDRESSES.polygon.USDT],
  // Arc USDC is the chain's native gas asset exposed as an ERC-20.
  [CHAIN.ARC]: [ADDRESSES.arc.USDC, ADDRESSES.arc.EURC],
};

const chainConfig = Object.fromEntries(
  Object.keys(TOKENS).map((chain) => [chain, { start: ARMED }]),
);

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const tokens = TOKENS[options.chain];
  if (!tokens) return { dailyFees };

  // 1) Candidate legs: token transfers addressed to the fee receiver.
  const toTopic = topic(FEE_RECEIVER);
  const candidates: { token: string; from: string; amount: bigint; tx: string; index: number }[] = [];
  const transferLogs = await options.getLogs({
    targets: tokens,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, null, toTopic],
    entireLog: true,
    parseLog: true,
  });
  for (const log of transferLogs) {
    const args = log.args
    candidates.push({
      token: lower(log.address),
      from: lower(args.from),
      amount: BigInt(args.amount),
      tx: txHashOf(log),
      index: Number(log.logIndex ?? log.log_index ?? 0),
    });
  }
  if (!candidates.length) {
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  }

  // 2) A genuine fee leg is one Aqua `Pulled` (app = router) matched to exactly one
  // transfer to the receiver. Match on tx, token, maker and amount, in log order, and
  // consume the pull. A Set of tx|token|maker would let one pull count every transfer
  // in that transaction. A donation has no matching pull, so it still drops out.
  const pulls = await options.getLogs({
    target: AQUA_REGISTRY,
    eventAbi: PULLED_EVENT,
    topics: [PULLED_TOPIC],
    entireLog: true,
    parseLog: true,
  });
  const available: { tx: string; token: string; maker: string; amount: bigint; index: number }[] = [];
  for (const log of pulls) {
    const args = log.args;
    if (lower(args.app) !== ROUTER) continue;
    available.push({
      tx: txHashOf(log),
      token: lower(args.token),
      maker: lower(args.maker),
      amount: BigInt(args.amount),
      index: Number(log.logIndex ?? log.log_index ?? 0),
    });
  }
  available.sort((x, y) => x.index - y.index);
  candidates.sort((x, y) => x.index - y.index);
  for (const c of candidates) {
    const i = available.findIndex(
      (p) => p.tx === c.tx && p.token === c.token && p.maker === c.from && p.amount === c.amount,
    );
    if (i < 0) continue;
    available.splice(i, 1);
    dailyFees.add(c.token, c.amount, METRIC.TRADING_FEES);
  }

  // TRDEFI keeps the whole fee. There is no supplier or holder share, so the collected
  // amount is reported as revenue in full.
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees:
      "0.05% of the amount traded, collected by TRDEFI on positions created through its venue. The fee is embedded in the maker's signed order and paid to the receiver address when the position trades, so it is counted as the incoming token transfers it actually is. The fee rail has been in force since 2026-09-25; positions created before that carry no fee and are immutable.",
    Revenue:
      "The entire collected trading fee. TRDEFI retains 100% of it, with no share paid to suppliers or holders.",
    ProtocolRevenue: "The entire collected trading fee, retained by TRDEFI.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]:
        "0.05% protocol fee charged on the amount traded when a position created through TRDEFI trades.",
    },
    Revenue: {
      [METRIC.TRADING_FEES]:
        "0.05% protocol fee charged on the amount traded when a position created through TRDEFI trades.",
    },
    ProtocolRevenue: {
      [METRIC.TRADING_FEES]:
        "0.05% protocol fee charged on the amount traded when a position created through TRDEFI trades, retained by TRDEFI.",
    },
  },
};

export default adapter;

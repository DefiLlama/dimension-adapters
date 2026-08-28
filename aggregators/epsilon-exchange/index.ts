import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactions, getTxReceipts } from "../../helpers/getTxReceipts";

// Epsilon (epsilon.exchange) on Robinhood Chain — v7.1 router.
const ROUTER = "0xdb41fa80016dc946ceb7b8512c3423463d3f260f";

// FeeVault — protocol commission (VAT on the keeper+referral legs) and captured
// surplus land here (router.feeCollector()).
const FEE_COLLECTOR = "0x8bdd3f2476501d2b1550792e7df8aa72f4adc70e";
// Aggregation-fee collector (router.aggregationFeeCollector()).
const AGGREGATION_FEE_COLLECTOR = "0xac834ee1a23458d84035724327c66236771fb96d";

const SWAPPED =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address referrer, uint256 referralFee, uint256 aggregationFee, address feeToken)";

// Order fills (limit / DCA / trailing-stop executions) carry only hash +
// amounts, NOT the pair.
const ORDER_FILLED =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed keeper, uint256 amountIn, uint256 amountOut, uint256 remaining)";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// The `Order` struct is the first, fully-static arg of the keeper's execute*
// call: struct Order { uint256 salt; address maker; address receiver; address
// tokenIn; address tokenOut; uint256 amountIn; uint256 triggerPrice; uint256
// triggerAmountOut; MakerTraits makerTraits; address referrer; uint32
// referralFeePpm; }. An address at struct word N sits in calldata hex at
// 2 + (4 + N*32)*2 + 24 .. +40 (0x prefix + selector + N words + 12 pad bytes).
const structAddr = (input: string, word: number): string =>
  "0x" + input.slice(2 + (4 + word * 32) * 2 + 24, 2 + (4 + word * 32) * 2 + 64).toLowerCase();
const RECEIVER_WORD = 2;
const TOKEN_IN_WORD = 3;
const REFERRER_WORD = 9;
// Minimum calldata length to safely read the referrer word.
const MIN_INPUT_LEN = 2 + (4 + (REFERRER_WORD + 1) * 32) * 2;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

const METRIC = {
  DIRECT_SWAPS: "Direct Swaps",
  ORDER_FILLS: "Order Fills",
  PROTOCOL_COMMISSION: "Protocol Commission",
  AGGREGATION_FEES: "Aggregation Fees",
  KEEPER_FEES: "Keeper Execution Fees",
  REFERRAL_FEES: "Referral Fees",
};

type TxMeta = {
  // Addresses whose incoming router transfers are fee legs.
  keepers: Set<string>;
  referrers: Set<string>;
  // Trade payout recipients (maker/receiver/swap user) — never counted as
  // fees, even if one of them also happens to be the referrer (self-referral).
  payouts: Set<string>;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const txMeta = new Map<string, TxMeta>();
  const meta = (txHash: string): TxMeta => {
    const key = txHash.toLowerCase();
    let m = txMeta.get(key);
    if (!m) {
      m = { keepers: new Set(), referrers: new Set(), payouts: new Set() };
      txMeta.set(key, m);
    }
    return m;
  };

  // 1) Direct swaps — value the input leg straight from the event.
  const swaps: any[] = await options.getLogs({ target: ROUTER, eventAbi: SWAPPED, entireLog: true, parseLog: true });
  for (const s of swaps) {
    dailyVolume.add(s.args.tokenIn, s.args.amountIn, METRIC.DIRECT_SWAPS);
    const m = meta(s.transactionHash);
    m.payouts.add(String(s.args.user).toLowerCase());
    m.referrers.add(String(s.args.referrer).toLowerCase());
  }

  // 2) Order fills — amountIn is the filled slice (from the event); tokenIn,
  //    receiver and referrer are recovered from the fill-tx calldata (the
  //    Order struct). Fetch each unique fill-tx once.
  const fills: any[] = await options.getLogs({ target: ROUTER, eventAbi: ORDER_FILLED, entireLog: true, parseLog: true });
  if (fills.length) {
    const txHashes = [...new Set(fills.map((l) => l.transactionHash.toLowerCase()))];
    const txs = await getTransactions(options.chain, txHashes);
    const inputByTx: Record<string, string> = {};
    for (let i = 0; i < txHashes.length; i++) {
      const hash = txHashes[i];
      const tx = txs[i];
      if (!tx?.hash) throw new Error(`Missing transaction for OrderFilled tx ${hash}`);
      const input = tx.data ?? "0x";
      if (input.length < MIN_INPUT_LEN) throw new Error(`Unexpected calldata for OrderFilled tx ${hash}`);
      inputByTx[hash] = input;
    }

    for (const log of fills) {
      const txHash = log.transactionHash.toLowerCase();
      const input = inputByTx[txHash];
      if (!input) throw new Error(`Missing calldata for OrderFilled log in tx ${txHash}`);
      dailyVolume.add(structAddr(input, TOKEN_IN_WORD), log.args.amountIn, METRIC.ORDER_FILLS);

      const m = meta(txHash);
      m.keepers.add(String(log.args.keeper).toLowerCase());
      m.payouts.add(String(log.args.maker).toLowerCase());
      m.payouts.add(structAddr(input, RECEIVER_WORD));
      m.referrers.add(structAddr(input, REFERRER_WORD));
    }
  }

  // 3) Fee legs — every fee is paid as an ERC20 transfer out of the router in
  //    the trade tx: protocol commission → FeeVault, aggregation fee → the
  //    aggregation collector, keeper fee → the fill keeper, referral fee → the
  //    order/swap referrer. Routing legs and trade payouts are ignored because
  //    only known fee recipients are counted.
  const feeTxHashes = [...txMeta.keys()];
  if (feeTxHashes.length) {
    const receipts = await getTxReceipts(options.chain, feeTxHashes);
    for (let i = 0; i < feeTxHashes.length; i++) {
      const receipt = receipts[i];
      if (!receipt) throw new Error(`Missing receipt for Epsilon tx ${feeTxHashes[i]}`);
      const m = txMeta.get(feeTxHashes[i])!;
      for (const log of receipt.logs ?? []) {
        if (log.topics?.[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue;
        const from = "0x" + log.topics[1].slice(26).toLowerCase();
        if (from !== ROUTER) continue;
        const to = "0x" + log.topics[2].slice(26).toLowerCase();
        const token = log.address;
        const amount = log.data;

        if (to === FEE_COLLECTOR) {
          dailyFees.add(token, amount, METRIC.PROTOCOL_COMMISSION);
          dailyRevenue.add(token, amount, METRIC.PROTOCOL_COMMISSION);
        } else if (to === AGGREGATION_FEE_COLLECTOR) {
          dailyFees.add(token, amount, METRIC.AGGREGATION_FEES);
          dailyRevenue.add(token, amount, METRIC.AGGREGATION_FEES);
        } else if (m.keepers.has(to)) {
          dailyFees.add(token, amount, METRIC.KEEPER_FEES);
          dailySupplySideRevenue.add(token, amount, METRIC.KEEPER_FEES);
        } else if (m.referrers.has(to) && to !== ZERO_ADDR && !m.payouts.has(to)) {
          dailyFees.add(token, amount, METRIC.REFERRAL_FEES);
          dailySupplySideRevenue.add(token, amount, METRIC.REFERRAL_FEES);
        }
      }
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Sum of direct aggregated-swap volumes and order fill volumes (limit, DCA and trailing-stop executions) routed through the Epsilon router on Robinhood Chain, valued on the input token leg.",
  Fees: "All fee legs charged on trades, measured from on-chain token transfers out of the router: protocol commission (including captured surplus), aggregation fees, keeper execution fees and referral fees.",
  UserFees: "All fees are paid by traders out of trade proceeds.",
  Revenue: "Protocol commission and aggregation fees, both collected by protocol-owned collectors.",
  ProtocolRevenue: "All revenue accrues to the protocol treasury (FeeVault and aggregation collector); there is no token.",
  SupplySideRevenue: "Keeper execution fees paid to order executors and referral fees paid to third-party referrers/integrators (permissionless rev-share).",
};

const breakdownMethodology = {
  Volume: {
    [METRIC.DIRECT_SWAPS]: "Aggregated market swaps executed directly through the router (Swapped events).",
    [METRIC.ORDER_FILLS]: "Keeper executions of limit, DCA and trailing-stop orders (OrderFilled events).",
  },
  Fees: {
    [METRIC.PROTOCOL_COMMISSION]: "Protocol cut (VAT) charged on top of keeper and referral fees, plus captured price-improvement surplus, transferred to the FeeVault.",
    [METRIC.AGGREGATION_FEES]: "Fee on aggregated swap routes, transferred to the aggregation-fee collector.",
    [METRIC.KEEPER_FEES]: "Execution fee paid to the keeper that fills a resting order.",
    [METRIC.REFERRAL_FEES]: "Referral leg paid to the referrer address named on the order or swap (permissionless rev-share).",
  },
  UserFees: {
    [METRIC.PROTOCOL_COMMISSION]: "Paid by traders as part of each trade's fee legs.",
    [METRIC.AGGREGATION_FEES]: "Paid by traders on aggregated swap routes.",
    [METRIC.KEEPER_FEES]: "Paid by makers on order fills.",
    [METRIC.REFERRAL_FEES]: "Paid by traders on referred flow.",
  },
  Revenue: {
    [METRIC.PROTOCOL_COMMISSION]: "Protocol commission and captured surplus kept in the FeeVault.",
    [METRIC.AGGREGATION_FEES]: "Aggregation fees kept by the protocol's aggregation collector.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_COMMISSION]: "Protocol commission and captured surplus kept in the FeeVault.",
    [METRIC.AGGREGATION_FEES]: "Aggregation fees kept by the protocol's aggregation collector.",
  },
  SupplySideRevenue: {
    [METRIC.KEEPER_FEES]: "Execution fees earned by keepers for filling orders.",
    [METRIC.REFERRAL_FEES]: "Referral fees earned by third-party referrers and integrators.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-08-19",
  methodology,
  breakdownMethodology,
};

export default adapter;

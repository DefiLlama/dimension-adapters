import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";

const ROUTER = "0x303ca5c65aabcb1ce242df93f478c41e0e4d2580";
const FEE_COLLECTOR = "0x7b7a3028acccc4a22767b0853d72afbfdb4032dd";
// 10% of the protocol fee goes to esALB holders, paid out later from the fee collector EOA
const HOLDER_SHARE_DENOMINATOR = 10n;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const SWAPPED =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)";
const ORDER_FILLED =
  "event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed keeper, uint256 amountIn, uint256 amountOut, uint256 remaining)";

const METRIC = {
  DIRECT_SWAPS: "Direct Swaps",
  ORDER_FILLS: "Order Fills",
  PROTOCOL_FEES: "Protocol Fees",
  HOLDER_FEES: "Protocol Fees To esALB Holders",
  KEEPER_FEES: "Keeper Execution Fees",
};

const topicToAddress = (topic: string) => "0x" + topic.slice(26).toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const swaps = await options.getLogs({ target: ROUTER, eventAbi: SWAPPED, entireLog: true, parseLog: true });
  const fills = await options.getLogs({ target: ROUTER, eventAbi: ORDER_FILLED, entireLog: true, parseLog: true });
  for (const swap of swaps) dailyVolume.add(swap.args.tokenIn, swap.args.amountIn, METRIC.DIRECT_SWAPS);

  const txHashes: string[] = [...new Set<string>([...swaps, ...fills].map((log: any) => log.transactionHash.toLowerCase()))];
  const receipts = await getTxReceiptsWithRetry(options.chain, txHashes);
  const transfersByTx: Record<string, { token: string; from: string; to: string; amount: bigint }[]> = {};
  txHashes.forEach((hash, i) => {
    if (!receipts[i]) throw new Error(`Missing receipt for Epsilon tx ${hash}`);
    transfersByTx[hash] = receipts[i]!.logs
      .filter((log) => log.topics[0] === TRANSFER_TOPIC && log.topics.length === 3)
      .map((log) => ({ token: log.address.toLowerCase(), from: topicToAddress(log.topics[1]), to: topicToAddress(log.topics[2]), amount: BigInt(log.data) }));
  });

  // OrderFilled carries no tokenIn: the router pulls it from the maker in the same tx
  const keepersByTx: Record<string, Set<string>> = {};
  for (const fill of fills) {
    const hash = fill.transactionHash.toLowerCase();
    const maker = fill.args.maker.toLowerCase();
    const pull = transfersByTx[hash].find((t) => t.from === maker && t.to === ROUTER);
    if (!pull) throw new Error(`Epsilon fill in tx ${hash}: no tokenIn transfer from maker ${maker} to the router`);
    dailyVolume.add(pull.token, fill.args.amountIn, METRIC.ORDER_FILLS);
    (keepersByTx[hash] ??= new Set()).add(fill.args.keeper.toLowerCase());
  }

  for (const hash of txHashes) {
    for (const { token, from, to, amount } of transfersByTx[hash]) {
      if (from !== ROUTER) continue;
      if (to === FEE_COLLECTOR) {
        const holderAmount = amount / HOLDER_SHARE_DENOMINATOR;
        for (const balances of [dailyFees, dailyRevenue, dailyProtocolRevenue]) balances.add(token, amount - holderAmount, METRIC.PROTOCOL_FEES);
        for (const balances of [dailyFees, dailyRevenue, dailyHoldersRevenue]) balances.add(token, holderAmount, METRIC.HOLDER_FEES);
      } else if (keepersByTx[hash]?.has(to)) {
        dailyFees.add(token, amount, METRIC.KEEPER_FEES);
        dailySupplySideRevenue.add(token, amount, METRIC.KEEPER_FEES);
      }
    }
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Direct swaps and order fills (limit, stop-loss, DCA and trailing-stop executions) routed through the Epsilon router of Alien Base on Base, valued on the input token.",
  Fees: "Protocol fee sent to the Epsilon fee collector on each swap and fill, plus the execution fee paid to the keeper that fills an order.",
  Revenue: "Protocol fee sent to the Epsilon fee collector: 90% kept by the protocol and 10% paid to esALB holders.",
  ProtocolRevenue: "90% of the protocol fee sent to the Epsilon fee collector.",
  HoldersRevenue: "10% of the protocol fee sent to the Epsilon fee collector, paid to esALB holders.",
  SupplySideRevenue: "Execution fees paid to the keepers that fill orders.",
};

const breakdownMethodology = {
  Volume: {
    [METRIC.DIRECT_SWAPS]: "Market swaps executed directly through the router (Swapped events), valued on the input token.",
    [METRIC.ORDER_FILLS]: "Keeper executions of limit, stop-loss, DCA and trailing-stop orders (OrderFilled events), valued on the input token.",
  },
  Fees: {
    [METRIC.PROTOCOL_FEES]: "90% of the protocol fee, kept by the protocol.",
    [METRIC.HOLDER_FEES]: "10% of the protocol fee, paid to esALB holders.",
    [METRIC.KEEPER_FEES]: "Execution fee paid to the keeper that fills an order.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "90% of the protocol fee, kept by the protocol.",
    [METRIC.HOLDER_FEES]: "10% of the protocol fee, paid to esALB holders.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "90% of the protocol fee, kept by the protocol.",
  },
  HoldersRevenue: {
    [METRIC.HOLDER_FEES]: "10% of the protocol fee, paid to esALB holders.",
  },
  SupplySideRevenue: {
    [METRIC.KEEPER_FEES]: "Execution fee paid to the keeper that fills an order.",
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

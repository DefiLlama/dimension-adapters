import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";

const FEE_WALLET = "0x86b9610Fc80f3af1D94114ECBede5d4B77445074";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const chainConfig: Record<string, { hubs: string[]; start: string }> = {
  [CHAIN.ARC]: { hubs: ["0x26b8259b6308789e66b4b9f516c5a68768f11027"], start: "2026-09-21" },
  [CHAIN.BASE]: { hubs: ["0xc2d1e4678b894b78548e1f8335cd8df4038d4034"], start: "2026-09-21" },
  [CHAIN.HYPERLIQUID]: { hubs: ["0xd5383f2eeca0abf4893b9e8be84865a1f178f1d7"], start: "2026-09-21" },
  [CHAIN.BSC]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-09-23" },
  [CHAIN.ROBINHOOD]: {
    hubs: [
      "0x26b8259b6308789e66b4b9f516c5a68768f11027",
      "0xfd2e63e130dbac76a3df5a4c4e6c5c8bd0026e90",
    ],
    start: "2026-09-23",
  },
  [CHAIN.AVAX]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-09-30" },
  [CHAIN.OPTIMISM]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-09-30" },
  [CHAIN.ELYSIUM]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-11-12" },
};

const EXECUTED = "event Executed(address indexed user, address indexed executor, bytes32 indexed dstProtocolId, uint256 oldTokenId, uint256 newTokenId, uint128 liquidity)";
const SHARES_EXECUTED = "event SharesExecuted(address indexed user, address indexed executor, bytes32 indexed dstProtocolId, uint256 sourceId, uint256 destinationId, uint128 liquidity, bool sourceIsShares, bool destinationIsShares, uint128 sourceShares)";

const fetch = async (options: FetchOptions) => {
  const { hubs } = chainConfig[options.chain];
  const executions = await options.getLogs({ targets: hubs, eventAbi: EXECUTED, entireLog: true });
  const shareExecutions = await options.getLogs({ targets: hubs, eventAbi: SHARES_EXECUTED, entireLog: true });
  const hubTxs = new Set([...executions, ...shareExecutions].map((log: any) => String(log.transactionHash).toLowerCase()));

  const fees = options.createBalances();
  if (hubTxs.size) {
    const hashes = [...hubTxs];
    const receipts = await getTxReceiptsWithRetry(options.chain, hashes);
    const missing = hashes.filter((_, i) => !receipts[i]);
    if (missing.length) throw new Error(`${options.chain}: no receipt for ${missing.length} Hub transaction(s), e.g. ${missing[0]}`);
    const wallet = FEE_WALLET.toLowerCase();
    for (const receipt of receipts) {
      for (const log of receipt!.logs) {
        if (log.topics.length !== 3 || log.topics[0].toLowerCase() !== TRANSFER_TOPIC || log.data === "0x") continue;
        if (("0x" + log.topics[2].slice(26)).toLowerCase() !== wallet) continue;
        fees.add(log.address, BigInt(log.data));
      }
    }
  }

  const dailyFees = options.createBalances();
  dailyFees.addBalances(fees, METRIC.SERVICE_FEES);
  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(fees, METRIC.SERVICE_FEES);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Fees: "Fees users pay on zaps, rebalances and swaps through LPStation, if any: ERC20 transfers into the LPStation fee wallet made inside a Hub execution.",
  Revenue: "All the fees users pay on zaps, rebalances and swaps through LPStation are retained by LPStation.",
  ProtocolRevenue: "All the fees users pay on zaps, rebalances and swaps through LPStation are retained by LPStation.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "Fees on zaps, rebalances and swaps through LPStation.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "Fees on zaps, rebalances and swaps through LPStation.",
  },
  ProtocolRevenue: {
    [METRIC.SERVICE_FEES]: "All the fees users pay on zaps, rebalances and swaps through LPStation are retained by LPStation.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;

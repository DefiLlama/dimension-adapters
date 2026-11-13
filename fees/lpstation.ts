// LPStation — fees adapter.
//
// LPStation (https://lpstation.xyz) is a non-custodial liquidity manager for concentrated-liquidity DEXes. A user
// zaps into, rebalances, tops up, migrates or withdraws a position in one transaction through the LPStation Hub; the
// position NFT stays in the user's own wallet, so LPStation has no TVL of its own.
//
// LPStation is free to use for now. A fee may be added later on zaps, rebalances or swaps; it would be paid inside the
// user's Hub transaction to one wallet, the same address on every chain:
//
//   0x86b9610Fc80f3af1D94114ECBede5d4B77445074
//
// That wallet also receives transfers that are not fees, so only ERC20 transfers into it made inside a Hub execution
// are counted. The period's Hub transactions are found from the Hub's events and their receipts are read. Native-coin
// inflows are not counted. Until a fee is added, every day is a correct zero.
// -----------------------------------------------------------------------------------------------------
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";

const FEE_WALLET = "0x86b9610Fc80f3af1D94114ECBede5d4B77445074";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)

// The Hub of each chain: the contract users approve and call. Robinhood also has a second Hub for Fables share
// positions. Start dates are each first Hub's deployment day (creation blocks noted).
const chainConfig: Record<string, { hubs: string[]; start: string }> = {
  [CHAIN.ARC]: { hubs: ["0x26b8259b6308789e66b4b9f516c5a68768f11027"], start: "2026-09-21" }, // block 21972209
  [CHAIN.BASE]: { hubs: ["0xc2d1e4678b894b78548e1f8335cd8df4038d4034"], start: "2026-09-21" }, // block 51592887
  [CHAIN.HYPERLIQUID]: { hubs: ["0xd5383f2eeca0abf4893b9e8be84865a1f178f1d7"], start: "2026-09-21" }, // block 46481530
  [CHAIN.BSC]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-09-23" }, // block 123474468
  [CHAIN.ROBINHOOD]: {
    hubs: [
      "0x26b8259b6308789e66b4b9f516c5a68768f11027", // block 70108674
      "0xfd2e63e130dbac76a3df5a4c4e6c5c8bd0026e90", // block 94405889, Fables share positions
    ],
    start: "2026-09-23",
  },
  [CHAIN.AVAX]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-09-30" }, // block 96461954
  [CHAIN.OPTIMISM]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-09-30" }, // block 157590214
  [CHAIN.ELYSIUM]: { hubs: ["0x14b5099aafdc511eb5f3747497bb5fe70c64d0f3"], start: "2026-11-12" }, // block 5380065
};

// Every Hub execution emits one of these.
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
        // an ERC20 Transfer has three topics and the amount in data (an ERC721 Transfer, the position NFT, has four)
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

  return { dailyFees, dailyRevenue };
};

const methodology = {
  Fees: "Fees users pay on zaps, rebalances and swaps through LPStation, if any: ERC20 transfers into the LPStation fee wallet made inside a Hub execution.",
  Revenue: "Fees received by LPStation.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]: "Fees on zaps, rebalances and swaps through LPStation.",
  },
  Revenue: {
    [METRIC.SERVICE_FEES]: "Fees on zaps, rebalances and swaps through LPStation.",
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

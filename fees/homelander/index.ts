import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { chainConfig, collectSwaps, protocolShareBps, shareOf } from "./shared";

// Homelander is MEV-X's yield maximization layer for AMMs: a plugin that runs
// inside the pool. It sets the pool's fee on every swap, and when a swap moves
// the pool away from the wider market it closes that gap in the same
// transaction and pays the realised arbitrage out to the pool's beneficiaries
// instead of leaving it to an outside searcher.
//
// Two things are counted here, and they are different money:
//
//   * the fee the trader paid, set by the plugin and earned by the pool, of
//     which the plugin takes nothing, and
//   * the arbitrage the plugin realised, which nobody paid as a rate and which
//     is split between the pool's beneficiaries and the protocol.
//
// The pools are third-party AMM pools, so their swap fees are also reported by
// those AMMs' own listings. `doublecounted` is set for that reason, here and on
// the volume adapter.

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// The distributor states the whole of a capture in one event, including a
// payout made in the chain's native currency, which moves no ERC-20 and would
// be invisible to a reading based on transfers. Its sibling
// ProfitDistributedZero, emitted when distributeProfit is called on an empty
// balance, carries amount = 0 under its own signature and is never read.
const profitDistributedAbi =
  "event ProfitDistributed(address plugin, bytes32 indexed configId, address token, address swapRecipient, uint256 amount)";

// The plugins that pay the pool's liquidity providers inside the swap, through
// the pool manager's own Donate, and never route that leg to a distributor.
// Only `donatedToLps` is read: `sentToDistributor` is the leg the distributor
// reports itself, and adding both would count it twice.
//
// The event comes in two shapes. One indexes `profitToken` and the other does
// not, which leaves the topic unchanged and the data layout different, so each
// is read with its own ABI rather than one guessed to fit both.
const profitSharedAbi =
  "event ProfitShared(bytes32 indexed poolId, address profitToken, uint256 donatedToLps, uint256 sentToDistributor)";
const profitSharedIndexedAbi =
  "event ProfitShared(bytes32 indexed poolId, address indexed profitToken, uint256 donatedToLps, uint256 sentToDistributor)";

const LABEL = {
  toLPs: "MEV Rewards To LPs",
  toProtocol: "MEV Rewards To Protocol",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const settings = chainConfig[options.chain];
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  // Returned empty on purpose rather than omitted: the plugin sets the pool's
  // fee but takes no share of it, so nothing here is paid to the protocol by a
  // user. A reported zero says that; a missing dimension only says that nobody
  // measured it.
  const dailyUserFees = options.createBalances();

  const add = (bag: any, token: string, amount: bigint, label: string) => {
    if (amount <= 0n) return;
    if (token.toLowerCase() === ZERO_ADDRESS) bag.addGasToken(amount, label);
    else bag.add(token, amount, label);
  };

  // 1. the fee the trader paid, at the rate the plugin set. None of it reaches
  //    the protocol: the plugin's own share of the swap fee is zero on every
  //    pool, so the whole of it is the pool's and its AMM's.
  const { fees } = await collectSwaps(options);
  for (const [token, amount] of Object.entries(fees)) {
    add(dailyFees, token, amount, METRIC.SWAP_FEES);
    add(dailySupplySideRevenue, token, amount, METRIC.SWAP_FEES);
  }

  // 2. the arbitrage settled through a distributor, split by the share config
  //    that was in force when it happened
  const distributors = settings?.distributors ?? [];
  if (distributors.length) {
    const logs = await options.getLogs({
      targets: distributors.map((d) => d.address),
      eventAbi: profitDistributedAbi,
      entireLog: true,
      parseLog: true,
    });
    for (const log of logs) {
      const amount = BigInt(log.args.amount.toString());
      const token = String(log.args.token);
      const ours = shareOf(amount, protocolShareBps(options.chain, String(log.address), Number(log.blockNumber)));
      add(dailyFees, token, amount, METRIC.MEV_REWARDS);
      add(dailyRevenue, token, ours, LABEL.toProtocol);
      add(dailyProtocolRevenue, token, ours, LABEL.toProtocol);
      add(dailySupplySideRevenue, token, amount - ours, LABEL.toLPs);
    }
  }

  // 3. the arbitrage donated to the pool's liquidity providers directly, which
  //    no distributor sees and of which the protocol keeps nothing
  const plugins = settings?.donatingPlugins;
  if (plugins) {
    for (const [eventAbi, targets] of [
      [profitSharedAbi, plugins.plain ?? []],
      [profitSharedIndexedAbi, plugins.indexedToken ?? []],
    ] as [string, string[]][]) {
      if (!targets.length) continue;
      for (const log of await options.getLogs({ targets, eventAbi })) {
        const amount = BigInt(log.donatedToLps.toString());
        add(dailyFees, String(log.profitToken), amount, METRIC.MEV_REWARDS);
        add(dailySupplySideRevenue, String(log.profitToken), amount, LABEL.toLPs);
      }
    }
  }

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Two things, and they are different money. First, the fee a trader paid on a swap in a pool the plugin runs in, at the rate the plugin set for that swap; the plugin takes no share of that fee, so nothing of it is charged to the user on the protocol's behalf. Second, the arbitrage the plugin realised inside the pool and paid out, read from the ProfitDistributed event where a deployment settles through a distributor and from the donatedToLps leg of ProfitShared where the plugin pays the pool's liquidity providers directly.",
  Revenue: "The protocol's share of the captured arbitrage, taken from the distributor's own share config as it stood at the block of each capture. Nothing of the swap fee is the protocol's, and the captures donated straight to liquidity providers leave it nothing either.",
  ProtocolRevenue: "Same as Revenue. There is no token, so nothing is distributed to holders.",
  SupplySideRevenue: "The swap fee in full, which the pool's liquidity providers and its AMM earn, plus the part of every capture that the share config pays to the pool's beneficiaries.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "The fee traders paid on the pools the plugin runs in, at the rate the plugin set.",
    [METRIC.MEV_REWARDS]: "Arbitrage captured by the plugin when a swap moves the pool away from the wider market, closed out in the same transaction.",
  },
  Revenue: { [LABEL.toProtocol]: "The protocol's weight in the distributor's share config, applied to each capture." },
  ProtocolRevenue: { [LABEL.toProtocol]: "The protocol's weight in the distributor's share config, applied to each capture." },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES]: "The swap fee, which the pool's liquidity providers and its AMM earn in full.",
    [LABEL.toLPs]: "The rest of every capture, paid to the pool's beneficiaries.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  doublecounted: true,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;

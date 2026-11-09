import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Sushi token launchpad, deploys ERC-20s and opens their SushiSwap V3 pool.
// https://www.sushi.com/robinhood/launchpad
// https://docs.sushi.com/contracts/launchpad
// V1 ran on Robinhood Chain only. V2 replaced it there and is the only version on Arc; it adds
// fee dispositions where part of the fee can be burned or spent buying back the launch token.
const LAUNCHPADS: Record<string, { v1?: string[]; v2?: string[] }> = {
  [CHAIN.ROBINHOOD]: {
    v1: ["0x104F1Ab42674565EC3DF0BFEbCcC4186f72fA7ED"],
    v2: ["0xf1716ebf85836ffe2985db9a50dd29e5814cabe9"],
  },
  [CHAIN.ARC]: {
    v2: ["0xf8027a52e2c910d9fff720f311c87cb3b0e76f9a"],
  },
};

const FEES_DISTRIBUTED_V1 =
  "event FeesDistributed(address indexed caller, address indexed token, address indexed pool, address creator, address protocolRecipient, uint16 sushiFeeBps, uint256 quoteCollected, uint256 tokenCollected, uint256 quoteToSushi, uint256 tokenToSushi, uint256 quoteToCreator, uint256 tokenToCreator)";

const FEES_DISTRIBUTED_V2 =
  "event FeesDistributed(address indexed caller, address indexed token, address indexed pool, uint8 feeDisposition, uint16 sushiFeeBps, uint256 quoteCollected, uint256 launchTokenCollected, uint256 quoteToSushi, uint256 launchTokenToSushi, uint256 quoteToReceiver, uint256 launchTokenToReceiver, uint256 launchTokenFeesBurned, uint256 quoteUsedForBuyback, uint256 launchTokenBoughtAndBurned, int24 priorMeanTick, int24 recentMeanTick, int24 spotTick, uint256 maxDeviationBps, bool ownerOverride)";

const LAUNCH_FEES_WITHDRAWN =
  "event LaunchFeesWithdrawn(address indexed recipient, uint256 amount)";

const LABEL_TRADING_FEES = "Trading Fees";
const LABEL_CREATOR = "Creator Fees";
const LABEL_BURN = "Launch Token Burns";
const LABEL_BUYBACK = "Launch Token Buybacks";
const LABEL_LAUNCH = "Launch Fees";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const { v1 = [], v2 = [] } = LAUNCHPADS[options.chain];
  const launchpads = [...v1, ...v2];

  const [v1Logs, v2Logs, launchLogs] = await Promise.all([
    v1.length ? options.getLogs({ targets: v1, eventAbi: FEES_DISTRIBUTED_V1 }) : [],
    v2.length ? options.getLogs({ targets: v2, eventAbi: FEES_DISTRIBUTED_V2 }) : [],
    options.getLogs({ targets: launchpads, eventAbi: LAUNCH_FEES_WITHDRAWN }),
  ]);

  // FeesDistributed carries no quote-token address, and launches are not all
  // quoted in the gas token - on Robinhood Chain most pools pair the launch
  // token against a tokenised stock (GME, AAPL, NVDA, ...) or USDG. Read the
  // pool's pair and take whichever side is not the launch token.
  const pools = [...new Set<string>([...v1Logs, ...v2Logs].map((log: any) => log.pool))];
  const pairs: Record<string, [string, string]> = {};
  if (pools.length) {
    // token0/token1 are immutable, so read them at the latest block - the
    // window's block is historical and the public RPC is not archival.
    const [token0s, token1s] = await Promise.all([
      options.api.multiCall({ abi: "address:token0", calls: pools }),
      options.api.multiCall({ abi: "address:token1", calls: pools }),
    ]);
    pools.forEach((pool, i) => {
      pairs[pool.toLowerCase()] = [token0s[i], token1s[i]];
    });
  }

  const quoteToken = (log: any) => {
    const [token0, token1] = pairs[log.pool.toLowerCase()];
    const launch = log.token.toLowerCase();
    if (token0.toLowerCase() === launch) return token1;
    if (token1.toLowerCase() === launch) return token0;
    throw new Error(
      `launch token ${log.token} is not in pool ${log.pool} (${token0}/${token1})`
    );
  };

  for (const log of v1Logs) {
    const quote = quoteToken(log);

    dailyFees.add(quote, log.quoteCollected, LABEL_TRADING_FEES);
    dailyFees.add(log.token, log.tokenCollected, LABEL_TRADING_FEES);

    dailyRevenue.add(quote, log.quoteToSushi, LABEL_TRADING_FEES);
    dailyRevenue.add(log.token, log.tokenToSushi, LABEL_TRADING_FEES);

    dailySupplySideRevenue.add(quote, log.quoteToCreator, LABEL_CREATOR);
    dailySupplySideRevenue.add(log.token, log.tokenToCreator, LABEL_CREATOR);
  }

  // quoteCollected = quoteToSushi + quoteToReceiver + quoteUsedForBuyback and
  // launchTokenCollected = launchTokenToSushi + launchTokenToReceiver + launchTokenFeesBurned.
  // launchTokenBoughtAndBurned is what the buyback quote purchased, not an extra fee.
  for (const log of v2Logs) {
    const quote = quoteToken(log);

    dailyFees.add(quote, log.quoteCollected, LABEL_TRADING_FEES);
    dailyFees.add(log.token, log.launchTokenCollected, LABEL_TRADING_FEES);

    dailyRevenue.add(quote, log.quoteToSushi, LABEL_TRADING_FEES);
    dailyRevenue.add(log.token, log.launchTokenToSushi, LABEL_TRADING_FEES);

    dailySupplySideRevenue.add(quote, log.quoteToReceiver, LABEL_CREATOR);
    dailySupplySideRevenue.add(log.token, log.launchTokenToReceiver, LABEL_CREATOR);
    dailySupplySideRevenue.add(log.token, log.launchTokenFeesBurned, LABEL_BURN);
    dailySupplySideRevenue.add(quote, log.quoteUsedForBuyback, LABEL_BUYBACK);
  }

  for (const log of launchLogs) {
    dailyFees.addGasToken(log.amount, LABEL_LAUNCH);
    dailyRevenue.addGasToken(log.amount, LABEL_LAUNCH);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Accrued 1% SushiSwap V3 trading fees collected in launch token pools plus fixed gas-token fees paid per token launch.",
  Revenue: "Sushi's share (sushiFeeBps) of accrued V3 trading fees plus fixed launch fees, which belong entirely to Sushi.",
  ProtocolRevenue: "Sushi's share (sushiFeeBps) of accrued V3 trading fees plus fixed launch fees, which belong entirely to Sushi.",
  SupplySideRevenue: "The remainder of accrued V3 trading fees: paid to the token creator or fee receiver, burned as launch tokens, or spent buying back the launch token, per the launch's fee disposition.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_TRADING_FEES]: "Accrued 1% SushiSwap V3 trading fees collected in launch token pools, emitted as quoteCollected and tokenCollected in FeesDistributed.",
    [LABEL_LAUNCH]: "Fixed gas-token fee paid per new token launch; the full amount belongs to Sushi, emitted via LaunchFeesWithdrawn.",
  },
  Revenue: {
    [LABEL_TRADING_FEES]: "Sushi's share of accrued V3 trading fees, emitted as quoteToSushi and tokenToSushi in FeesDistributed.",
    [LABEL_LAUNCH]: "Fixed launch fee retained by Sushi, emitted via LaunchFeesWithdrawn.",
  },
  ProtocolRevenue: {
    [LABEL_TRADING_FEES]: "Sushi's share of accrued V3 trading fees, emitted as quoteToSushi and tokenToSushi in FeesDistributed.",
    [LABEL_LAUNCH]: "Fixed launch fee retained by Sushi, emitted via LaunchFeesWithdrawn.",
  },
  SupplySideRevenue: {
    [LABEL_CREATOR]: "Share of accrued V3 trading fees paid to the token creator (V1) or the launch's fee receiver (V2), emitted in FeesDistributed.",
    [LABEL_BURN]: "Launch-token fees burned under the V2 burn fee disposition, emitted as launchTokenFeesBurned.",
    [LABEL_BUYBACK]: "Quote fees spent buying back and burning the launch token under the V2 buyback fee disposition, emitted as quoteUsedForBuyback.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ROBINHOOD]: { start: "2026-07-28" },
    [CHAIN.ARC]: { start: "2026-09-15" },
  },
  methodology,
  breakdownMethodology,
  doublecounted: true, // sushiswap
};

export default adapter;

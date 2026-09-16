import { getEventLogs, util } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// LunyaLaunchFactory, placed through CreateX with CREATE3 at the same address on every chain
const LAUNCH_FACTORY = "0xFB68A7bdc87B6754b5DD092586b8E2904BaAD46E";
// The block the factory was deployed at
const FROM_BLOCK = 21067677;
// Arc produces a block every half second, so a day spans ~60k blocks while its public endpoints cap a
// log query well below that - the one this was tested against refuses 10k. Split the window rather
// than ask for it whole, with room to spare since the cap is the node operator's to change.
const MAX_BLOCK_RANGE = 5_000;

// LunyaLaunchCP.BPS: every rate on a launch is in basis points
const BPS = 10_000n;

const eventLaunchCreated =
  "event LaunchCreated(address indexed launch, address indexed token, address indexed creator, uint8 launchType, address quoteToken, string name, string symbol, string contractURI, bytes launchParams)";
// fee is the whole fee the trade paid, anti-snipe surcharge included
const eventTrade =
  "event Trade(address indexed trader, bool isBuy, uint256 quoteAmount, uint256 tokenAmount, uint256 fee, uint256 reserve, uint256 sold)";
// reserve is what the curve raised; no trade can move it between completion and graduation
const eventCurveCompleted = "event CurveCompleted(uint256 reserve)";
// quoteSeeded is the quote the graduation actually put into the pool
const eventGraduated =
  "event Graduated(address indexed pool, uint256 tokenId, uint256 quoteSeeded, uint256 tokensSeeded, uint128 liquidity)";
// Every field is a static type, so the struct decodes the same as a flat tuple
const abiConfig =
  "function config() view returns (address factory, address quoteToken, address creator, address creatorFeeRecipient, address positionManager, address liquidityHelper, address locker, uint256 nativeDivisor, bool wrapsNative, uint256 totalSupply, uint128 virtualQuote, uint128 virtualToken, uint128 curveSupply, uint128 lpSupply, uint16 snipeTaxBps, uint32 snipeWindow, uint8 snipeDecay, uint128 graduationReward, uint16 curveFeeBps, uint16 curveFeeProtocolBps, uint16 graduationFeeBps, uint16 poolFeeProtocolBps, uint8 graduationPoolType)";
const abiIsExempt = "function isExempt(address recipient) view returns (bool)";

const LABEL_SNIPE = "Anti-Snipe Surcharge";
const LABEL_GRADUATION = "Graduation Fees";
const LABEL_REMAINDER = "Graduation Liquidity Remainder";

const addressOf = (log: any) => String(log.address ?? log.source).toLowerCase();
const blockOf = (log: any) => Number(log.blockNumber ?? log.block_number);

async function fetch(options: FetchOptions) {
  const { api, chain, createBalances, startTimestamp } = options;
  // Queried straight through the sdk, as uniswap-v4 and zora-sofi do, so the window can be split:
  // Arc is not on the indexer and its public endpoints cap a log query well below a day of blocks.
  const fromBlock = Number(options.fromApi.block);
  const toBlock = Number(options.toApi.block);
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const result = () => ({ dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue });

  const created = await getEventLogs({ chain, target: LAUNCH_FACTORY, eventAbi: eventLaunchCreated, fromBlock: FROM_BLOCK, toBlock, onlyArgs: true, cacheInCloud: true, maxBlockRange: MAX_BLOCK_RANGE });
  if (!created.length) return result();
  const quoteOf: Record<string, string> = {};
  for (const log of created) quoteOf[String(log.launch).toLowerCase()] = log.quoteToken;
  const launches = Object.keys(quoteOf);

  const parsed = { entireLog: true, parseLog: true, onlyArgs: false };
  const trades = await getEventLogs({ chain, targets: launches, eventAbi: eventTrade, fromBlock, toBlock, ...parsed, maxBlockRange: MAX_BLOCK_RANGE });
  const graduations = await getEventLogs({ chain, targets: launches, eventAbi: eventGraduated, fromBlock, toBlock, ...parsed, maxBlockRange: MAX_BLOCK_RANGE });
  if (!trades.length && !graduations.length) return result();

  // A launch's config and opening time are fixed once it opens, so reading them now reads them as they were
  const active = [...new Set([...trades, ...graduations].map(addressOf))];
  const configs = await api.multiCall({ abi: abiConfig, calls: active });
  const openedAts = await api.multiCall({ abi: "function openedAt() view returns (uint40)", calls: active });
  const cfg: Record<string, any> = {};
  active.forEach((launch, i) => { cfg[launch] = { ...configs[i], openedAt: BigInt(openedAts[i]) }; });

  // THE SURCHARGE IS NOT IN THE EVENT. Trade carries the whole fee, but the anti-snipe part goes entirely to
  // the protocol while the rest splits by curveFeeProtocolBps, so it is recomputed here exactly as
  // LunyaLaunchCP._snipeTaxBps and _quoteBuy do. It only exists on buys within snipeWindow seconds of opening.
  const blockTimes: Record<number, bigint> = {};
  const exempt: Record<string, boolean> = {};
  for (const log of trades) {
    const launch = addressOf(log);
    const c = cfg[launch];
    const quote = quoteOf[launch];
    const fee = BigInt(log.args.fee);
    const window = BigInt(c.snipeWindow);

    let snipeFee = 0n;
    if (log.args.isBuy && window > 0n && BigInt(c.snipeTaxBps) > 0n && c.openedAt + window > BigInt(startTimestamp)) {
      const block = blockOf(log);
      blockTimes[block] ??= BigInt(await util.getTimestamp(block, chain));
      const elapsed = blockTimes[block] - c.openedAt;
      if (elapsed < window) {
        const key = `${launch}:${String(log.args.trader).toLowerCase()}`;
        exempt[key] ??= await api.call({ target: launch, abi: abiIsExempt, params: [log.args.trader] });
        if (!exempt[key]) {
          const decay = BigInt(c.snipeDecay);
          let snipeBps = (BigInt(c.snipeTaxBps) * (window - elapsed) ** decay) / window ** decay;
          let feeBps = BigInt(c.curveFeeBps) + snipeBps;
          if (feeBps >= BPS) {
            feeBps = BPS - 1n;
            snipeBps = feeBps - BigInt(c.curveFeeBps);
          }
          if (snipeBps !== 0n && feeBps !== 0n) snipeFee = (fee * snipeBps) / feeBps;
        }
      }
    }

    // mirrors LunyaLaunchCP._accrue: the protocol's share is the multiplication, the creator's the remainder
    const base = fee - snipeFee;
    const toProtocol = (base * BigInt(c.curveFeeProtocolBps)) / BPS;
    dailyFees.add(quote, base, METRIC.TRADING_FEES);
    dailyRevenue.add(quote, toProtocol, METRIC.TRADING_FEES);
    dailySupplySideRevenue.add(quote, base - toProtocol, METRIC.TRADING_FEES);
    if (snipeFee > 0n) {
      dailyFees.add(quote, snipeFee, LABEL_SNIPE);
      dailyRevenue.add(quote, snipeFee, LABEL_SNIPE);
    }
  }

  if (graduations.length) {
    const graduated = [...new Set(graduations.map(addressOf))];
    const completions = await getEventLogs({ chain, targets: graduated, eventAbi: eventCurveCompleted, fromBlock: FROM_BLOCK, toBlock, cacheInCloud: true, ...parsed, maxBlockRange: MAX_BLOCK_RANGE });
    const raisedOf: Record<string, bigint> = {};
    for (const log of completions) raisedOf[addressOf(log)] = BigInt(log.args.reserve);

    for (const log of graduations) {
      const launch = addressOf(log);
      const c = cfg[launch];
      const quote = quoteOf[launch];
      const raised = raisedOf[launch];
      if (raised === undefined) throw new Error(`lunya-launchpad: graduation of ${launch} has no CurveCompleted`);

      // mirrors LunyaLaunchCP.graduate
      const gradFee = (raised * BigInt(c.graduationFeeBps)) / BPS;
      const reward = BigInt(c.graduationReward) < gradFee ? BigInt(c.graduationReward) : gradFee;
      const remainder = raised - gradFee - BigInt(log.args.quoteSeeded);

      dailyFees.add(quote, gradFee, LABEL_GRADUATION);
      dailyRevenue.add(quote, gradFee - reward, LABEL_GRADUATION);
      dailySupplySideRevenue.add(quote, reward, LABEL_GRADUATION);
      if (remainder > 0n) {
        dailyFees.add(quote, remainder, LABEL_REMAINDER);
        dailyRevenue.add(quote, remainder, LABEL_REMAINDER);
      }
    }
  }

  return result();
}

const methodology = {
  Fees: "Every fee a Lunya bonding curve charges: the trading fee on buys and sells, the anti-snipe surcharge on buys in a launch's first seconds, the graduation fee taken from the raise when a curve graduates into a Lunya DEX pool, and the quote left over when that graduation mints its liquidity. Swap fees on graduated pools are counted under Lunya DEX, not here.",
  Revenue: "The protocol's share of trading fees, the whole anti-snipe surcharge, the graduation fee less the reward paid to whoever triggers the graduation, and the graduation's liquidity remainder.",
  ProtocolRevenue: "Everything the protocol keeps, which accrues to the factory's fee pot for each quote token.",
  SupplySideRevenue: "The launch creator's share of trading fees, and the reward paid to whoever triggers a graduation.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "curveFeeBps of every bonding-curve buy and sell, taken in the launch's quote token.",
    [LABEL_SNIPE]: "An extra charge on buys in the first snipeWindow seconds after a launch opens, decaying to zero. Sells and exempt addresses never pay it.",
    [LABEL_GRADUATION]: "graduationFeeBps of what a curve raised, taken when it graduates.",
    [LABEL_REMAINDER]: "Quote left over after a graduation mints its liquidity position.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "The protocol's share of each trading fee, curveFeeProtocolBps of it.",
    [LABEL_SNIPE]: "The whole surcharge. The creator is exempt from it and receives none of it.",
    [LABEL_GRADUATION]: "The graduation fee less the reward paid to whoever triggers the graduation.",
    [LABEL_REMAINDER]: "The whole remainder accrues to the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "The protocol's share of each trading fee, curveFeeProtocolBps of it.",
    [LABEL_SNIPE]: "The whole surcharge. The creator is exempt from it and receives none of it.",
    [LABEL_GRADUATION]: "The graduation fee less the reward paid to whoever triggers the graduation.",
    [LABEL_REMAINDER]: "The whole remainder accrues to the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.TRADING_FEES]: "The creator's share of each trading fee.",
    [LABEL_GRADUATION]: "The graduation reward, capped at the graduation fee, paid to whoever triggers the graduation.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-15",
  methodology,
  breakdownMethodology,
};

export default adapter;

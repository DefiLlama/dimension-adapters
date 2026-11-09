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
const eventQuoteApproved =
  "event QuoteTokenApproved(address indexed quoteToken, bool wrapsNative, uint64 nativeDivisor, uint128 creationFee, uint128 graduationReward)";
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

const LABEL_CREATION = "Creation Fees";
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
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const result = () => ({ dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue });

  const parsed = { entireLog: true, parseLog: true, onlyArgs: false };
  const created = await getEventLogs({ chain, target: LAUNCH_FACTORY, eventAbi: eventLaunchCreated, fromBlock: FROM_BLOCK, toBlock, cacheInCloud: true, ...parsed, maxBlockRange: MAX_BLOCK_RANGE });
  if (!created.length) return result();
  const quoteOf: Record<string, string> = {};
  for (const log of created) quoteOf[String(log.args.launch).toLowerCase()] = log.args.quoteToken;
  const launches = Object.keys(quoteOf);

  // creationFee is factory.quoteConfig(quote).creationFee, last QuoteTokenApproved at or before toBlock.
  // Source: https://docs.lunya.io/developers/launchpad/fees.md
  const approvals = await getEventLogs({ chain, target: LAUNCH_FACTORY, eventAbi: eventQuoteApproved, fromBlock: FROM_BLOCK, toBlock, cacheInCloud: true, ...parsed, maxBlockRange: MAX_BLOCK_RANGE });
  const creationFeeOf: Record<string, bigint> = {};
  for (const log of approvals) creationFeeOf[String(log.args.quoteToken).toLowerCase()] = BigInt(log.args.creationFee);
  for (const log of created) {
    if (blockOf(log) < fromBlock) continue;
    const quote = log.args.quoteToken;
    const fee = creationFeeOf[String(quote).toLowerCase()];
    if (fee === undefined) throw new Error(`lunya-launchpad: no QuoteTokenApproved for ${quote}`);
    if (fee > 0n) {
      dailyFees.add(quote, fee, LABEL_CREATION);
      dailyRevenue.add(quote, fee, LABEL_CREATION);
    }
  }

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
    const quoteAmount = BigInt(log.args.quoteAmount);
    const window = BigInt(c.snipeWindow);
    // Pre-bonding only. Buys: trader paid quoteAmount + fee. Sells: quoteAmount is the reserve taken before the fee.
    // Source: https://docs.lunya.io/developers/launchpad/events.md
    dailyVolume.add(quote, log.args.isBuy ? quoteAmount + fee : quoteAmount);

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
  Volume: "Pre-bonding curve buys and sells. Graduated pool swaps are counted under Lunya DEX.",
  Fees: "Creation fees, curve trading fees, anti-snipe surcharge, graduation fees, and leftover quote at graduation. Excludes Lunya DEX swap fees.",
  Revenue: "Creation fees, the protocol share of curve fees, the full anti-snipe surcharge, graduation fees minus the trigger reward, and leftover quote at graduation.",
  ProtocolRevenue: "The same as Revenue.",
  SupplySideRevenue: "Creator share of curve fees, and the graduation trigger reward.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL_CREATION]: "Flat creation fee paid in the quote token when a launch opens.",
    [METRIC.TRADING_FEES]: "Curve trading fee on buys and sells.",
    [LABEL_SNIPE]: "Extra fee on buys in the anti-snipe window.",
    [LABEL_GRADUATION]: "Share of the raise taken at graduation.",
    [LABEL_REMAINDER]: "Quote not seeded into the pool at graduation.",
  },
  Revenue: {
    [LABEL_CREATION]: "All of the creation fee.",
    [METRIC.TRADING_FEES]: "Protocol share of the curve trading fee.",
    [LABEL_SNIPE]: "All of the anti-snipe surcharge.",
    [LABEL_GRADUATION]: "Graduation fee minus the trigger reward.",
    [LABEL_REMAINDER]: "All leftover quote at graduation.",
  },
  ProtocolRevenue: {
    [LABEL_CREATION]: "All of the creation fee.",
    [METRIC.TRADING_FEES]: "Protocol share of the curve trading fee.",
    [LABEL_SNIPE]: "All of the anti-snipe surcharge.",
    [LABEL_GRADUATION]: "Graduation fee minus the trigger reward.",
    [LABEL_REMAINDER]: "All leftover quote at graduation.",
  },
  SupplySideRevenue: {
    [METRIC.TRADING_FEES]: "Creator share of the curve trading fee.",
    [LABEL_GRADUATION]: "Reward paid to whoever triggers graduation.",
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

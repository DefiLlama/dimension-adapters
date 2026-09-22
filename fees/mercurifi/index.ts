import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// mercurifi (launch.mercuri.finance) - bonding-curve launchpad on Arc. A launch is one transaction: the factory
// deploys the token and its own BondingCurve, and the token trades against that curve priced in USDC, which is
// also Arc's gas token. The buy that sells the curve out opens a Uniswap v4 pool at the curve's last price in
// the same transaction and sends the position to a locker with no withdraw function; after that the launch's
// trades are ordinary v4 swaps, and one immutable hook charges the same trade fee the curve did.
//
// Every fee is paid to a single FeeManager, so the money is read from two of its events plus the curves' own
// Buy event. Source (verified on the explorer, full match on Sourcify):
// https://github.com/mercuri-finance/mercuri-launch-contracts
const FEE_MANAGER = "0x31d1bfe59b783f4c077f853f962d1355afb52580";
const FACTORY = "0x8f5dfa0c48e14ccd03ae01795b8a95759ba859eb";
const GRADUATION_MANAGER = "0x5e82a03a30a1627cb0fa860dbe708e262e5124e4";
// LaunchFactory's deployment block: the first launch cannot predate it.
const FACTORY_BLOCK = 22060881;

// The factory announces each launch with the token and the curve it deployed for it. This is the only registry
// of legitimate curves, and it is what makes the fee events below trustworthy.
const TOKEN_CREATED =
  "event TokenCreated(address indexed token, address indexed curve, address indexed creator, address deployer, string name, string symbol, string metadataURI, bytes32 configHash, tuple(uint256 virtualUsdc, uint256 virtualTokens, uint256 curveSupply, uint256 poolSupply, uint256 launchFee, uint256 maxInitialBuyTokens, uint16 tradeFeeBps, uint16 creatorShareBps, uint16 referrerShareBps, uint16 snipeStartBps, uint32 snipeBlocks) config)";
// The trade fee, already split by the FeeManager. `source` is 0 for a trade against a bonding curve and 1 for a
// swap in a graduated token's Uniswap v4 pool.
const FEE_ACCRUED =
  "event FeeAccrued(address indexed token, address indexed trader, address creator, address referrer, uint256 creatorAmount, uint256 referrerAmount, uint256 platformAmount, uint8 source)";
// Everything else the platform receives. `accruePlatform` is permissionless, so this event alone does not prove
// where the money came from: only events whose `from` is the factory, or the very curve the factory deployed for
// that token, are counted (see `fetch`).
const PLATFORM_ACCRUED =
  "event PlatformAccrued(address indexed token, address indexed from, uint256 amount)";
// A curve emits this once, when it has sold out and is handing its reserve over to be paired in the pool. It is
// what separates the two things a curve forwards to the platform: before it, the snipe tax on a buy; after it,
// the USDC left in the curve once the pool is seeded.
const CURVE_COMPLETED = "event CurveCompleted(uint256 usdcForPool, uint256 tokensForPool)";

// FeeManager's `source` byte on FeeAccrued.
const SOURCE_CURVE = 0;

const CURVE_TRADE_FEES = "Curve Trade Fees";
const POOL_TRADE_FEES = "Pool Trade Fees";
const LAUNCH_FEES = "Launch Fees";
const SNIPE_TAX = "Snipe Tax";
const GRADUATION_DUST = "Graduation Dust";
const REFERRER_FEES = "Referrer Fees";
const TRADE_FEES_TO_TREASURY = "Trade Fees to Treasury";
const LAUNCH_FEES_TO_TREASURY = "Launch Fees to Treasury";
const SNIPE_TAX_TO_TREASURY = "Snipe Tax to Treasury";
const GRADUATION_DUST_TO_TREASURY = "Graduation Dust to Treasury";

const lower = (value: any) => String(value).toLowerCase();

// Amounts in every event are native USDC wei (18 decimals): on Arc, USDC is the gas token, so addGasToken prices
// them. There is no second asset anywhere in the protocol.
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Every launch the factory has ever made, so a curve can be checked against the token it belongs to. Cached,
  // because it is the same scan every hour.
  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_CREATED,
    fromBlock: FACTORY_BLOCK,
    cacheInCloud: true,
  });
  const curveOfToken = new Map<string, string>();
  for (const launch of launches) curveOfToken.set(lower(launch.token), lower(launch.curve));
  const curves = [...curveOfToken.values()];

  const [tradeFeeLogs, platformLogs, completedLogs] = await Promise.all([
    options.getLogs({ target: FEE_MANAGER, eventAbi: FEE_ACCRUED }),
    options.getLogs({ target: FEE_MANAGER, eventAbi: PLATFORM_ACCRUED, entireLog: true, parseLog: true }),
    curves.length
      ? options.getLogs({ targets: curves, eventAbi: CURVE_COMPLETED, entireLog: true, parseLog: true })
      : Promise.resolve([]),
  ]);

  for (const log of tradeFeeLogs) {
    // A trade against a curve and a swap in a graduated token's pool pay the same rate; only the venue differs.
    const label = Number(log.source) === SOURCE_CURVE ? CURVE_TRADE_FEES : POOL_TRADE_FEES;
    const creatorAmount = BigInt(log.creatorAmount);
    const referrerAmount = BigInt(log.referrerAmount);
    const platformAmount = BigInt(log.platformAmount);

    dailyFees.addGasToken(creatorAmount + referrerAmount + platformAmount, label);
    // The creator's half is claimable by the token's creator and the referrer's share by the trader's referrer
    // where one is bound on chain: both are costs to the protocol, not revenue.
    dailySupplySideRevenue.addGasToken(creatorAmount, METRIC.CREATOR_FEES);
    dailySupplySideRevenue.addGasToken(referrerAmount, REFERRER_FEES);
    dailyRevenue.addGasToken(platformAmount, TRADE_FEES_TO_TREASURY);
    dailyProtocolRevenue.addGasToken(platformAmount, TRADE_FEES_TO_TREASURY);
  }

  // Where each curve sold out, by transaction: `${tx}:${curve}` to that log's index.
  const completedAt = new Map<string, number>();
  for (const log of completedLogs) {
    completedAt.set(`${lower(log.transactionHash)}:${lower(log.address)}`, Number(log.logIndex));
  }

  const toPlatform = (amount: bigint, feeLabel: string, revenueLabel: string) => {
    dailyFees.addGasToken(amount, feeLabel);
    dailyRevenue.addGasToken(amount, revenueLabel);
    dailyProtocolRevenue.addGasToken(amount, revenueLabel);
  };

  // `accruePlatform` takes anyone's money with any token address, so the event alone does not say where the
  // money came from. Each one is classified by its sender, exactly as the protocol's own indexer does: the
  // factory forwarding a launch fee, the GraduationManager or a sold-out curve handing over what is left after
  // the pool is seeded, or a curve forwarding the snipe tax it took on a buy. Anything else - a stranger's
  // transfer, or the FeeManager sweeping an unaccounted balance, which emits the zero address as the token - is
  // not a fee a user paid, and is left out.
  for (const log of platformLogs) {
    const token = lower(log.args.token);
    const from = lower(log.args.from);
    const amount = BigInt(log.args.amount);

    if (from === FACTORY) {
      if (!curveOfToken.has(token)) continue;
      toPlatform(amount, LAUNCH_FEES, LAUNCH_FEES_TO_TREASURY);
      continue;
    }
    if (from === GRADUATION_MANAGER) {
      toPlatform(amount, GRADUATION_DUST, GRADUATION_DUST_TO_TREASURY);
      continue;
    }
    // Only the curve the factory recorded for that token is trusted with the token's fees.
    if (curveOfToken.get(token) !== from) continue;

    const soldOutAt = completedAt.get(`${lower(log.transactionHash)}:${from}`);
    const afterSellOut = soldOutAt !== undefined && soldOutAt < Number(log.logIndex);
    if (afterSellOut) toPlatform(amount, GRADUATION_DUST, GRADUATION_DUST_TO_TREASURY);
    else toPlatform(amount, SNIPE_TAX, SNIPE_TAX_TO_TREASURY);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  // Mainnet deployment, block 22060881.
  start: "2026-09-21",
  methodology: {
    Fees: "Every USDC a user pays the protocol: the 1% trade fee on the USDC side of each trade, on the bonding curve and in the graduated token's Uniswap v4 pool alike; the fee to create a token (1 USDC at deployment); the snipe tax on buys in a token's first 120 blocks; and the USDC left over once a graduating token's Uniswap v4 pool has been seeded.",
    Revenue:
      "The platform's share: 0.30% of a trade where the trader has a referrer bound on chain and 0.50% where they do not, plus all launch fees, all snipe tax and the graduation dust.",
    ProtocolRevenue:
      "Same as Revenue. There is no protocol token, so nothing is distributed to holders.",
    SupplySideRevenue:
      "0.50% of every trade to the token's creator and 0.20% to the trader's referrer, both claimable from the FeeManager.",
  },
  breakdownMethodology: {
    Fees: {
      [CURVE_TRADE_FEES]:
        "1% of the USDC side of every buy and sell against a bonding curve (FeeAccrued with source 0).",
      [POOL_TRADE_FEES]:
        "1% of the USDC side of every swap in a graduated token's Uniswap v4 pool, charged by the LaunchHook (FeeAccrued with source 1).",
      [LAUNCH_FEES]:
        "The fixed fee paid to create a token, forwarded by the factory (PlatformAccrued whose sender is the factory).",
      [SNIPE_TAX]:
        "Tax on buys only, 99% in the launch block falling in a straight line to zero over 120 blocks, forwarded by the token's own curve (PlatformAccrued from that curve, before it sold out).",
      [GRADUATION_DUST]:
        "The USDC left over once a graduating token's Uniswap v4 pool has been seeded - rounding dust and any configured surplus - forwarded by the curve or the GraduationManager.",
    },
    Revenue: {
      [TRADE_FEES_TO_TREASURY]: "The platform's share of each trade fee.",
      [LAUNCH_FEES_TO_TREASURY]: "Launch fees, which the platform keeps whole.",
      [SNIPE_TAX_TO_TREASURY]: "Snipe tax, which the platform keeps whole.",
      [GRADUATION_DUST_TO_TREASURY]: "Graduation dust, which the platform keeps whole.",
    },
    ProtocolRevenue: {
      [TRADE_FEES_TO_TREASURY]: "The platform's share of each trade fee.",
      [LAUNCH_FEES_TO_TREASURY]: "Launch fees, which the platform keeps whole.",
      [SNIPE_TAX_TO_TREASURY]: "Snipe tax, which the platform keeps whole.",
      [GRADUATION_DUST_TO_TREASURY]: "Graduation dust, which the platform keeps whole.",
    },
    SupplySideRevenue: {
      [METRIC.CREATOR_FEES]: "Half of every trade fee, claimable by the token's creator.",
      [REFERRER_FEES]:
        "0.20% of a trade by a trader who has a referrer bound on chain, claimable by that referrer.",
    },
  },
};

export default adapter;

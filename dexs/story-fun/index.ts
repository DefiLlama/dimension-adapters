import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Story.fun is a token launchpad on Robinhood Chain. A launch trades against its own BondingCurve
// until the curve sells out, at which point it graduates into a Uniswap V4 pool and stops being a
// Story.fun venue: the pool is an ordinary V4 pool and its swaps are reported by Uniswap V4, so
// only the bonding-curve leg is counted here.
//
// Volume is the quote asset that moved through the curve. The launch token is not valued: the
// bonding curve is the only thing pricing it, so counting its side would be counting this number
// twice.
const LAUNCH_FACTORY = "0x1A9BC7Fd7EE06Fa0477781633223bcC102C08fbd";
// LaunchFactory deployment block
const START_BLOCK = 75644816;
// Native ETH is the quote asset of every launch so far; the factory stores it as the zero address.
const NATIVE = "0x0000000000000000000000000000000000000000";

const tokenLaunchedAbi =
  "event TokenLaunched(address indexed token, address indexed curve, address indexed creator, bytes32 launchSalt, address quoteAsset, bytes32 quoteConfigHash, uint32 launchConfigId, uint16 curveFeeBps, int24 tickSpacing, address creatorFeeRecipient, uint16 creatorTaxBps, bool buybackEnabled, string name, string symbol, string logo, string description, (string,string,string,string,string,string) socials)";
// `grossQuoteIn` is what the buyer paid in, fees included
const curveBuyAbi =
  "event CurveBuy(address indexed buyer, address indexed recipient, uint128 grossQuoteIn, uint128 netQuoteIn, uint96 tokensOut, uint128 fee)";
// `grossQuoteOut` is what left the reserve, before the fees withheld from the seller
const curveSellAbi =
  "event CurveSell(address indexed seller, address indexed recipient, uint96 tokensIn, uint128 grossQuoteOut, uint128 netQuoteOut, uint128 fee)";

// topic0 of the two curve events, for a chain-wide scan: one curve per launch makes a targeted
// request per curve unworkable, so the node filters on the topic and the logs are then filtered on
// the emitting address
const topicCurveBuy = "0x2bcf012f3b807d8bceb45456638529ce6903269b98ca8d523751839d8de03863";
const topicCurveSell = "0x3acda8f364bc1e92bfde1daa77bfd32f93d226a2a2595a322fb85040e4e2a444";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();

  const addQuote = (quoteAsset: string, amount: bigint) => {
    if (quoteAsset.toLowerCase() === NATIVE) dailyVolume.addGasToken(amount);
    else dailyVolume.add(quoteAsset, amount);
  };

  const launches = await options.getLogs({
    target: LAUNCH_FACTORY,
    eventAbi: tokenLaunchedAbi,
    fromBlock: START_BLOCK,
    cacheInCloud: true,
  });
  const curveQuoteAsset: Record<string, string> = {};
  for (const log of launches) curveQuoteAsset[log.curve.toLowerCase()] = log.quoteAsset;

  const fromCurve = (log: any) => curveQuoteAsset[log.address.toLowerCase()] !== undefined;

  const [buys, sells] = await Promise.all([
    options.getLogs({ eventAbi: curveBuyAbi, topics: [topicCurveBuy], noTarget: true, entireLog: true, parseLog: true }),
    options.getLogs({ eventAbi: curveSellAbi, topics: [topicCurveSell], noTarget: true, entireLog: true, parseLog: true }),
  ]);

  for (const log of buys.filter(fromCurve))
    addQuote(curveQuoteAsset[log.address.toLowerCase()], BigInt(log.args.grossQuoteIn));
  for (const log of sells.filter(fromCurve))
    addQuote(curveQuoteAsset[log.address.toLowerCase()], BigInt(log.args.grossQuoteOut));

  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-09-29",
  methodology: {
    Volume:
      "Quote asset (native ETH) traded on Story.fun bonding curves, counted once per trade on its quote-asset leg. Trading in the Uniswap V4 pools that graduated launches move to is reported by Uniswap V4 and is not counted here.",
  },
};

export default adapter;

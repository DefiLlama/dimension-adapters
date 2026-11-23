import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// SolonPad bonding-curve volume on Arc. See fees/solonpad for the fee/revenue side and
// full provenance notes (github.com/solonlend/solonpad-skill).
//
// Only curve-mode trades are counted here. SolonPad's other launch mode (instant v4,
// the default since 2026-09-16) opens straight into a plain, hookless Uniswap v4 pool
// with no curve of its own -- that volume already belongs to the generic uniswap-v4
// dexs listing on Arc, so counting it again here would double it.
const CURVE_FACTORY = "0xd6b86b9B1bB64b941b21AaA6a0e3A673e8405A3b";
const CURVE_FACTORY_DEPLOY_BLOCK = 21134269;

const TOKEN_LAUNCHED_EVENT =
  "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)";
const CURVE_BUY_EVENT =
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)";
const CURVE_SELL_EVENT =
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const tokenLaunchedLogs = await options.getLogs({
    target: CURVE_FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock: CURVE_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
  });
  const curveToPairToken = new Map<string, string>(
    tokenLaunchedLogs.map((log: any) => [log.curve.toLowerCase(), log.pairToken]),
  );
  const curves = Array.from(curveToPairToken.keys());
  if (!curves.length) return { dailyVolume };

  const [buys, sells] = await Promise.all([
    options.getLogs({ targets: curves, eventAbi: CURVE_BUY_EVENT, flatten: false }),
    options.getLogs({ targets: curves, eventAbi: CURVE_SELL_EVENT, flatten: false }),
  ]);

  buys.forEach((logs: any[], i: number) => {
    const pairToken = curveToPairToken.get(curves[i])!;
    for (const log of logs) dailyVolume.add(pairToken, log.quoteIn);
  });
  sells.forEach((logs: any[], i: number) => {
    const pairToken = curveToPairToken.get(curves[i])!;
    // quoteOut is net of fee and tax; add them back for the gross traded amount.
    for (const log of logs) dailyVolume.add(pairToken, BigInt(log.quoteOut) + BigInt(log.fee) + BigInt(log.tax));
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-14",
  methodology: {
    Volume: "Gross quote-token value of every buy and sell on SolonPad bonding curves. Excludes SolonPad's instant-v4 launch pools (plain Uniswap v4 pools, already counted by the generic uniswap-v4 volume listing) and any post-graduation curve trading.",
  },
};

export default adapter;

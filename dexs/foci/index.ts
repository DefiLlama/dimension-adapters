import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Foci — token launchpad on Arc. Contracts: https://github.com/yonzaynator/foci
const FACTORY = "0xa392D6eca5242715517eeCd43406aeD19424FAC0"; // FociLaunchFactory
const FACTORY_START_BLOCK = 20883999; // 2026-09-14

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const launches = await options.getLogs({
    target: FACTORY,
    eventAbi: "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)",
    fromBlock: FACTORY_START_BLOCK,
    cacheInCloud: true,
  });
  const curvePairToken = new Map<string, string>(launches.map((l: any) => [String(l.curve).toLowerCase(), String(l.pairToken)]));
  if (!curvePairToken.size) return { dailyVolume };

  const buys = await options.getLogs({
    noTarget: true,
    eventAbi: "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
    entireLog: true,
    parseLog: true,
  });

  const sells = await options.getLogs({
    noTarget: true,
    eventAbi: "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
    entireLog: true,
    parseLog: true,
  });

  for (const b of buys) {
    const pairToken = curvePairToken.get(String(b.address).toLowerCase());
    if (!pairToken) continue;
    dailyVolume.add(pairToken, b.args.quoteIn);
  }

  for (const s of sells) {
    const pairToken = curvePairToken.get(String(s.address).toLowerCase());
    if (!pairToken) continue;
    dailyVolume.add(pairToken, s.args.quoteOut);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-09-14",
  methodology: {
    Volume: "Quote-token volume on Foci bonding curves: buys (gross of fee) and sells (net to seller). External to Foci pools are not counted.",
  },
};

export default adapter;

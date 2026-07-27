import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// BowYard is a USDG-native launchpad and DEX on Robinhood Chain. The launchpad
// emits every bonding-curve trade from one root contract. Graduated markets are
// discovered from the DEX Factory's PairCreated event, so future pools require
// no adapter changes. Agent markets use the same model and are discovered from
// AgentTokenGraduated events on the Agent Launchpad V2 root.
//
// Public integration registry: https://bowyard.fun/integrations
// Contract registry: https://bowyard.fun/api/v1/contracts
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const LAUNCHPAD = "0x0F724aED8961C0446Cf73E9C45be562BEB22e774";
const DEX_FACTORY = "0x27275079932d9a5cBA34Cb40Bf86084bDdD89241";
const AGENT_LAUNCHPAD_V2 = "0xc5e8ee1D72f08a29CCEB465BeFf0B4b830D63750";

const DEX_FACTORY_DEPLOY_BLOCK = 19_285_460;
const AGENT_LAUNCHPAD_DEPLOY_BLOCK = 19_329_853;

const CURVE_TRADE =
  "event CurveTrade(address indexed token,address indexed trader,bool indexed isBuy,uint256 stableAmount,uint256 tokenAmount,uint256 protocolFee,uint256 creatorFee,uint256 stableRaised)";
const PAIR_CREATED =
  "event PairCreated(address indexed token,address indexed pair,address indexed creator)";
const DEX_SWAP =
  "event Swap(address indexed sender,address indexed recipient,bool stableToToken,uint256 amountIn,uint256 amountOut,uint256 protocolFee,uint256 creatorFee)";

const AGENT_CURVE_TRADE =
  "event AgentCurveTrade(address indexed token,address indexed trader,bool indexed isBuy,uint256 stableAmount,uint256 tokenAmount,uint256 feeAmount,uint256 stableRaised)";
const AGENT_TOKEN_GRADUATED =
  "event AgentTokenGraduated(address indexed token,address indexed pair,address indexed feeVault,uint256 stableLiquidity,uint256 tokenLiquidity)";
const AGENT_DEX_SWAP =
  "event AgentDexSwap(address indexed sender,address indexed recipient,bool indexed stableToToken,uint256 amountIn,uint256 amountOut,uint256 feeAmount)";

async function getClassicPairs(options: FetchOptions): Promise<string[]> {
  const logs = await options.getLogs({
    target: DEX_FACTORY,
    eventAbi: PAIR_CREATED,
    fromBlock: DEX_FACTORY_DEPLOY_BLOCK,
    cacheInCloud: true,
    onlyArgs: true,
  });
  return [...new Set(logs.map((log: any) => String(log.pair).toLowerCase()))];
}

async function getAgentPairs(options: FetchOptions): Promise<string[]> {
  const logs = await options.getLogs({
    target: AGENT_LAUNCHPAD_V2,
    eventAbi: AGENT_TOKEN_GRADUATED,
    fromBlock: AGENT_LAUNCHPAD_DEPLOY_BLOCK,
    cacheInCloud: true,
    onlyArgs: true,
  });
  return [...new Set(logs.map((log: any) => String(log.pair).toLowerCase()))];
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const [curveTrades, agentCurveTrades, classicPairs, agentPairs] = await Promise.all([
    options.getLogs({ target: LAUNCHPAD, eventAbi: CURVE_TRADE }),
    options.getLogs({ target: AGENT_LAUNCHPAD_V2, eventAbi: AGENT_CURVE_TRADE }),
    getClassicPairs(options),
    getAgentPairs(options),
  ]);

  for (const trade of curveTrades) dailyVolume.add(USDG, trade.stableAmount);
  for (const trade of agentCurveTrades) dailyVolume.add(USDG, trade.stableAmount);

  if (classicPairs.length) {
    const swaps = await options.getLogs({ targets: classicPairs, eventAbi: DEX_SWAP });
    for (const swap of swaps) {
      const grossStable = swap.stableToToken
        ? BigInt(swap.amountIn)
        : BigInt(swap.amountOut) + BigInt(swap.protocolFee) + BigInt(swap.creatorFee);
      dailyVolume.add(USDG, grossStable);
    }
  }

  if (agentPairs.length) {
    const swaps = await options.getLogs({ targets: agentPairs, eventAbi: AGENT_DEX_SWAP });
    for (const swap of swaps) {
      const grossStable = swap.stableToToken
        ? BigInt(swap.amountIn)
        : BigInt(swap.amountOut) + BigInt(swap.feeAmount);
      dailyVolume.add(USDG, grossStable);
    }
  }

  return { dailyVolume };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-25",
  fetch,
  methodology: {
    Volume:
      "Gross USDG notional of BowYard bonding-curve trades and post-graduation swaps. Classic pools are discovered from the BowYard DEX Factory PairCreated event; Agent pools are discovered from AgentTokenGraduated, so new markets are included automatically.",
  },
};

export default adapter;

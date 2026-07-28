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
const BPS = 10_000n;
const AGENT_CREATOR_BPS = 2_000n;
const AGENT_PROTOCOL_BPS = 2_000n;

const TOKEN_CREATED =
  "event TokenCreated(address indexed token,address indexed creator,string name,string symbol,string imageUri,uint256 creationFee)";
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

const LABEL = {
  CreationFees: "Token Creation Fees",
  CurveFees: "Bonding Curve Trading Fees",
  DexFees: "BowYard DEX Swap Fees",
  AgentCurveFees: "Agent Bonding Curve Trading Fees",
  AgentDexFees: "Agent DEX Swap Fees",
  CreationToProtocol: "Token Creation Fees to Protocol",
  CurveToProtocol: "Bonding Curve Fees to Protocol",
  CurveToCreators: "Bonding Curve Fees to Creators",
  DexToProtocol: "BowYard DEX Fees to Protocol",
  DexToCreators: "BowYard DEX Fees to Creators",
  AgentToProtocol: "Agent Trading Fees to Protocol",
  AgentToCreators: "Agent Trading Fees to Creators",
  AgentToOperators: "Agent Trading Fees to Operators and Ecosystem",
};

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

function addAgentFee(
  amount: bigint,
  feeLabel: string,
  dailyFees: ReturnType<FetchOptions["createBalances"]>,
  dailyProtocolRevenue: ReturnType<FetchOptions["createBalances"]>,
  dailySupplySideRevenue: ReturnType<FetchOptions["createBalances"]>,
) {
  const protocolShare = (amount * AGENT_PROTOCOL_BPS) / BPS;
  const creatorShare = (amount * AGENT_CREATOR_BPS) / BPS;
  const operatingAndEcosystemShare = amount - protocolShare - creatorShare;

  dailyFees.add(USDG, amount, feeLabel);
  dailyProtocolRevenue.add(USDG, protocolShare, LABEL.AgentToProtocol);
  dailySupplySideRevenue.add(USDG, creatorShare, LABEL.AgentToCreators);
  dailySupplySideRevenue.add(USDG, operatingAndEcosystemShare, LABEL.AgentToOperators);
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const tokenCreatedLogs = await options.getLogs({ target: LAUNCHPAD, eventAbi: TOKEN_CREATED });
  const curveTradeLogs = await options.getLogs({ target: LAUNCHPAD, eventAbi: CURVE_TRADE });
  const agentCurveTradeLogs = await options.getLogs({ target: AGENT_LAUNCHPAD_V2, eventAbi: AGENT_CURVE_TRADE });
  const classicPairs = await getClassicPairs(options);
  const agentPairs = await getAgentPairs(options);

  for (const launch of tokenCreatedLogs) {
    dailyFees.add(USDG, launch.creationFee, LABEL.CreationFees);
    dailyProtocolRevenue.add(USDG, launch.creationFee, LABEL.CreationToProtocol);
  }

  for (const trade of curveTradeLogs) {
    dailyVolume.add(USDG, trade.stableAmount);
    const protocolFee = BigInt(trade.protocolFee);
    const creatorFee = BigInt(trade.creatorFee);
    dailyFees.add(USDG, protocolFee + creatorFee, LABEL.CurveFees);
    dailyProtocolRevenue.add(USDG, protocolFee, LABEL.CurveToProtocol);
    dailySupplySideRevenue.add(USDG, creatorFee, LABEL.CurveToCreators);
  }

  for (const trade of agentCurveTradeLogs) {
    dailyVolume.add(USDG, trade.stableAmount);
    addAgentFee(
      BigInt(trade.feeAmount),
      LABEL.AgentCurveFees,
      dailyFees,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    );
  }

  if (classicPairs.length) {
    const swaps = await options.getLogs({ targets: classicPairs, eventAbi: DEX_SWAP });
    for (const swap of swaps) {
      const protocolFee = BigInt(swap.protocolFee);
      const creatorFee = BigInt(swap.creatorFee);
      dailyFees.add(USDG, protocolFee + creatorFee, LABEL.DexFees);
      dailyProtocolRevenue.add(USDG, protocolFee, LABEL.DexToProtocol);
      dailySupplySideRevenue.add(USDG, creatorFee, LABEL.DexToCreators);
    }
  }

  if (agentPairs.length) {
    const swaps = await options.getLogs({ targets: agentPairs, eventAbi: AGENT_DEX_SWAP });
    for (const swap of swaps) {
      const feeAmount = BigInt(swap.feeAmount);
      addAgentFee(
        feeAmount,
        LABEL.AgentDexFees,
        dailyFees,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
      );
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-25",
  fetch,
  methodology: {
    Volume:
      "Gross USDG notional of BowYard bonding-curve trades.",
    Fees:
      "USDG token-creation fees plus all trading fees from BowYard's classic and Agent bonding curves and post-graduation DEX pools.",
    UserFees: "All creation and trading fees paid by BowYard users, denominated in USDG.",
    Revenue:
      "Fees paid to the BowYard protocol treasury: the full classic token-creation fee, the classic protocol share of curve/DEX fees, and the immutable 20% protocol share of Agent trading fees.",
    ProtocolRevenue:
      "The full classic token-creation fee, the classic protocol share of curve/DEX fees, and 20% of Agent trading fees.",
    SupplySideRevenue:
      "Classic creator fee shares plus the Agent market shares routed to creators, operating recipients, and attributed ecosystem recipients.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL.CreationFees]: "The fixed USDG fee charged when a classic BowYard token is created.",
      [LABEL.CurveFees]: "Protocol and creator fees charged on classic bonding-curve trades.",
      [LABEL.DexFees]: "Protocol and creator fees charged by BowYard's permanently locked classic DEX pools.",
      [LABEL.AgentCurveFees]: "The aggregate 1% fee charged on Agent bonding-curve trades.",
      [LABEL.AgentDexFees]: "The aggregate 1% fee charged by graduated Agent DEX pools.",
    },
    Revenue: {
      [LABEL.CreationToProtocol]: "The full classic token-creation fee paid to the protocol treasury.",
      [LABEL.CurveToProtocol]: "The protocol share of classic bonding-curve fees.",
      [LABEL.DexToProtocol]: "The protocol share of classic BowYard DEX fees.",
      [LABEL.AgentToProtocol]: "The immutable 20% protocol share of Agent trading fees.",
    },
    ProtocolRevenue: {
      [LABEL.CreationToProtocol]: "The full classic token-creation fee paid to the protocol treasury.",
      [LABEL.CurveToProtocol]: "The protocol share of classic bonding-curve fees.",
      [LABEL.DexToProtocol]: "The protocol share of classic BowYard DEX fees.",
      [LABEL.AgentToProtocol]: "The immutable 20% protocol share of Agent trading fees.",
    },
    SupplySideRevenue: {
      [LABEL.CurveToCreators]: "The creator share of classic bonding-curve fees.",
      [LABEL.DexToCreators]: "The creator share of classic BowYard DEX fees.",
      [LABEL.AgentToCreators]: "The immutable 20% creator share of Agent trading fees.",
      [LABEL.AgentToOperators]:
        "The remaining 60% of Agent trading fees routed to the operating recipient and, when attributed, the ecosystem recipient.",
    },
  },
};

export default adapter;

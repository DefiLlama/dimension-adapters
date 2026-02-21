import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const PRINTR_CONTRACT = "0xb77726291b125515d0a7affeea2b04f2ff243172";

const TOKEN_TRADE_EVENT =
  "event TokenTrade(address indexed token, address indexed trader, bool isBuy, uint256 amount, uint256 cost, uint256 priceAfter, uint256 issuedSupply, uint256 reserve)";

const GET_CURVE_ABI =
  "function getCurve(address token) view returns (tuple(address basePair, uint16 totalCurves, uint256 maxTokenSupply, uint256 virtualReserve, uint256 reserve, uint256 completionThreshold))";

// 1% total bonding curve swap fee
// Fee split: 25% creator, 25% memecoin reserve, 40% buyback, 10% team
const FEE_RATE = 1 / 100;

const fetch = async ({ getLogs, createBalances, api }: FetchOptions) => {
  const dailyVolume = createBalances();

  const tradeLogs = await getLogs({
    target: PRINTR_CONTRACT,
    eventAbi: TOKEN_TRADE_EVENT,
  });

  if (!tradeLogs.length) {
    return { dailyVolume, dailyFees: createBalances() };
  }

  // Get unique token addresses to resolve their basePair token
  const uniqueTokens = Array.from(new Set(tradeLogs.map((log: any) => log.token)));

  const curves = await api.multiCall({
    abi: GET_CURVE_ABI,
    calls: uniqueTokens.map((token) => ({
      target: PRINTR_CONTRACT,
      params: [token],
    })),
    permitFailure: true,
  });

  // Build token -> basePair mapping
  const tokenBasePair: Record<string, string> = {};
  uniqueTokens.forEach((token: string, i: number) => {
    if (curves[i]?.basePair) {
      tokenBasePair[token] = curves[i].basePair;
    }
  });

  // Accumulate volume by basePair token
  // cost = the trade amount denominated in the base pair token
  for (const log of tradeLogs) {
    const basePair = tokenBasePair[log.token];
    if (!basePair) continue;
    dailyVolume.add(basePair, log.cost);
  }

  // Derive fee breakdown from volume
  const dailyFees = dailyVolume.clone(FEE_RATE, METRIC.SWAP_FEES); // 1% total fee
  const dailyRevenue = dailyVolume.clone(FEE_RATE * 0.1, METRIC.PROTOCOL_FEES);
  dailyRevenue.add(dailyVolume.clone(FEE_RATE * 0.25, 'Memecoin Reserve'));
  dailyRevenue.add(dailyVolume.clone(FEE_RATE * 0.4, METRIC.TOKEN_BUY_BACK));
  const dailyProtocolRevenue = dailyVolume.clone(FEE_RATE * 0.1, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.add(dailyVolume.clone(FEE_RATE * 0.25, 'Memecoin Reserve'));
  const dailyHoldersRevenue = dailyVolume.clone(FEE_RATE * 0.4, METRIC.TOKEN_BUY_BACK);
  const dailySupplySideRevenue = dailyVolume.clone(FEE_RATE * 0.25, METRIC.CREATOR_FEES);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Total trading volume from bonding curve buys and sells on the Printr protocol, tracked via on-chain TokenTrade events. Each trade's cost is denominated in the curve's base pair token (e.g. USDC, WETH, BNB).",
  Fees: "Printr charges a 1% fee on all bonding curve swaps.",
  Revenue:
    "75% of trading fees: team (10%), protocol-controlled memecoin reserve (25%), and buyback (40%).",
  ProtocolRevenue:
    "35% of trading fees: 10% to the Printr team and 25% to the protocol-controlled memecoin reserve fund (allocated via community voting for liquidity, listings, and growth).",
  HoldersRevenue:
    "40% of trading fees are used for buybacks, benefiting token holders.",
  SupplySideRevenue:
    "25% of trading fees go to token creators.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Printr charges a 1% fee on all bonding curve swaps.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "10% of trading fees go to the Printr team.",
    [METRIC.TOKEN_BUY_BACK]: "40% of trading fees are used for buybacks, benefiting token holders.",
    'Memecoin Reserve': "25% of trading fees go to the protocol-controlled memecoin reserve fund (allocated via community voting for liquidity, listings, and growth).",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "10% of trading fees go to the Printr team.",
    'Memecoin Reserve': "25% of trading fees go to the protocol-controlled memecoin reserve fund (allocated via community voting for liquidity, listings, and growth).",
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "40% of trading fees are used for buybacks, benefiting token holders.",
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: "25% of trading fees go to token creators.",
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  start: '2025-10-14',
  chains: [CHAIN.OPTIMISM, CHAIN.POLYGON, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.AVAX, CHAIN.MANTLE, CHAIN.MONAD],
  methodology,
  breakdownMethodology,
};

export default adapter;

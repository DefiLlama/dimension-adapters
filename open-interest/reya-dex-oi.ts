import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Source: Reya-Labs/reya-deployments packages/tomls/src/omnibus/reya_network.toml.
const PASSIVE_PERP_PROXY = "0x27E5cb712334e101B3c232eB0Be198baaa595F5F";
// Same endpoint the app.reya.xyz trade page loads (v2/marketDefinitions was removed)
const MARKET_DEFINITIONS_ENDPOINT = "https://api.reya.xyz/v2/perpMarketDefinitions";
const WAD = 1e18;

// Market symbols are <base>RUSDPERP; getInstantaneousPoolPrice reverts and lastMTM is stale, so the base is priced at the window end
const CG_IDS: Record<string, string> = {
  ETH: "ethereum",
  BTC: "bitcoin",
  SOL: "solana",
  HYPE: "hyperliquid",
  XRP: "ripple",
};

type MarketDefinition = {
  symbol: string;
  marketId: number;
};

const abis = {
  // Source: Reya docs + Reya-Labs/reya-deployments IPassivePerpProxy.
  getMarketData: "function getMarketData(uint128 marketId) view returns (tuple(tuple(uint128 id, uint128 passivePoolId, uint128 poolAccountId, address quoteToken, uint8 quoteTokenDecimals, int256 lastFundingVelocity, int256 lastFundingRate, uint256 lastFundingTimestamp, tuple(uint256 price, uint256 timestamp) lastMTM, tuple(int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) longTrackers, tuple(int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) shortTrackers, uint256 openInterest, int256 logPriceMultiplier, uint256 depthFactor, uint256 priceSpread, uint256 velocityMultiplier) marketData, uint256 blockTimestamp, uint256 blockNumber))",
};

const fetch = async (options: FetchOptions) => {
  const markets: MarketDefinition[] = await fetchURL(MARKET_DEFINITIONS_ENDPOINT);
  const cgIds = markets.map(({ symbol }) => {
    const cgId = CG_IDS[symbol.replace(/RUSDPERP$/, "")];
    if (!cgId) throw new Error(`reya: no price mapping for market ${symbol}`);
    return cgId;
  });

  const marketData = await options.toApi.multiCall({
    target: PASSIVE_PERP_PROXY,
    abi: abis.getMarketData,
    calls: markets.map(({ marketId }) => ({ params: [marketId] })),
  });

  const openInterestAtEnd = options.createBalances();
  marketData.forEach((market: any, i: number) => {
    // Reya team confirmed marketData.openInterest is one-sided long OI.
    openInterestAtEnd.addCGToken(cgIds[i], Number(market.marketData.openInterest) / WAD);
  });

  // Matched book, so no long/short split is reported: it would be this number twice.
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.REYA],
  fetch,
  start: "2026-03-11", // Latest proxy implementation deployment, return 0 data befor this date
};

export default adapter;

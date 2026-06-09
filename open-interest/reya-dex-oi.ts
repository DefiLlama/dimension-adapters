import fetchURL from "../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Source: Reya-Labs/reya-deployments packages/tomls/src/omnibus/reya_network.toml.
const PASSIVE_PERP_PROXY = "0x27E5cb712334e101B3c232eB0Be198baaa595F5F";
const MARKET_DEFINITIONS_ENDPOINT = "https://api.reya.xyz/v2/marketDefinitions";
const WAD = 1e18;

type MarketDefinition = {
  marketId: number;
};

const abis = {
  // Source: Reya docs + Reya-Labs/reya-deployments IPassivePerpProxy.
  getMarketData: "function getMarketData(uint128 marketId) view returns (tuple(tuple(uint128 id, uint128 passivePoolId, uint128 poolAccountId, address quoteToken, uint8 quoteTokenDecimals, int256 lastFundingVelocity, int256 lastFundingRate, uint256 lastFundingTimestamp, tuple(uint256 price, uint256 timestamp) lastMTM, tuple(int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) longTrackers, tuple(int256 fundingValue, uint256 baseMultiplier, uint256 adlUnwindPrice) shortTrackers, uint256 openInterest, int256 logPriceMultiplier, uint256 depthFactor, uint256 priceSpread, uint256 velocityMultiplier) marketData, uint256 blockTimestamp, uint256 blockNumber))",
  getInstantaneousPoolPrice: "function getInstantaneousPoolPrice(uint128 marketId) view returns (uint256)",
};

const fetch = async (options: FetchOptions) => {
  const markets: MarketDefinition[] = await fetchURL(MARKET_DEFINITIONS_ENDPOINT);
  const calls = markets.map(({ marketId }) => ({ params: [marketId] }));

  const [marketData, poolPrices] = await Promise.all([
    options.toApi.multiCall({
      target: PASSIVE_PERP_PROXY,
      abi: abis.getMarketData,
      calls,
      permitFailure: true,
    }),
    options.toApi.multiCall({
      target: PASSIVE_PERP_PROXY,
      abi: abis.getInstantaneousPoolPrice,
      calls,
      permitFailure: true,
    }),
  ]);

  const oneSidedOpenInterest = marketData.reduce((sum: number, market: any, i: number) => {
    if (!market || poolPrices[i] == null) return sum;
    // Reya team confirmed marketData.openInterest is one-sided long OI.
    const oi = Number(market.marketData.openInterest) / WAD;
    const price = Number(poolPrices[i]) / WAD;
    return sum + oi * price;
  }, 0);

  const longOpenInterestAtEnd = oneSidedOpenInterest;
  const shortOpenInterestAtEnd = oneSidedOpenInterest;

  return {
    openInterestAtEnd: longOpenInterestAtEnd + shortOpenInterestAtEnd,
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.REYA],
  fetch,
  start: "2026-03-11", // Latest proxy implementation deployment, return 0 data befor this date
};

export default adapter;

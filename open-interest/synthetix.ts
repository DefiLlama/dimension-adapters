import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const { api } = options;

  const marketSummaries = await api.call({
    abi: 'function allProxiedMarketSummaries() external view returns (tuple(address market, bytes32 asset, bytes32 key, uint maxLeverage, uint price, uint marketSize, int marketSkew, uint marketDebt, int currentFundingRate, int currentFundingVelocity, tuple(uint makerFee, uint takerFee, uint makerFeeDelayedOrder, uint takerFeeDelayedOrder, uint makerFeeOffchainDelayedOrder, uint takerFeeOffchainDelayedOrder) feeRates)[] memory)',
    target: '0x340B5d664834113735730Ad4aFb3760219Ad9112'
  });

  let totalLongUSD = 0;
  let totalShortUSD = 0;

  marketSummaries.forEach((summary: any) => {
    const marketSize = BigInt(summary.marketSize);
    const marketSkew = BigInt(summary.marketSkew);
    const indexPrice = BigInt(summary.price);

    if (marketSize > 0n) {
      const longOI = (marketSize + marketSkew) / 2n;
      const shortOI = (marketSize - marketSkew) / 2n;

      totalLongUSD += Number(longOI * indexPrice) / 1e36;
      totalShortUSD += Number(shortOI * indexPrice) / 1e36;
    }
  });

  return { openInterestAtEnd: totalLongUSD + totalShortUSD, longOpenInterestAtEnd: totalLongUSD, shortOpenInterestAtEnd: totalShortUSD };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: '2023-04-22',
  runAtCurrTime: true,
};

export default adapter;

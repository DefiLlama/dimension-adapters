import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const fetch = async (options: FetchOptions) => {
  const { api } = options;

  const marketSummaries = await api.call({
    abi: 'function allProxiedMarketSummaries() external view returns (tuple(address market, bytes32 asset, bytes32 key, uint maxLeverage, uint price, uint marketSize, int marketSkew, uint marketDebt, int currentFundingRate, int currentFundingVelocity, tuple(uint makerFee, uint takerFee, uint makerFeeDelayedOrder, uint takerFeeDelayedOrder, uint makerFeeOffchainDelayedOrder, uint takerFeeOffchainDelayedOrder) feeRates)[] memory)',
    target: '0x340B5d664834113735730Ad4aFb3760219Ad9112'
  });

  let totalOpenInterestUSD = 0;

  marketSummaries.forEach((summary: any) => {
    const marketSize = BigInt(summary.marketSize);
    const marketSkew = BigInt(summary.marketSkew);
    const indexPrice = BigInt(summary.price);

    if (marketSize > 0n) {
      const longOI = marketSize > 0n ? (marketSize + marketSkew) / 2n : 0n;
      const shortOI = marketSize > 0n ? (marketSize - marketSkew) / 2n : 0n;

      const longUSD = Number(longOI * indexPrice) / 1e36;
      const shortUSD = Number(shortOI * indexPrice) / 1e36;
      totalOpenInterestUSD += longUSD + shortUSD;
    }
  });

  return { openInterestAtEnd: totalOpenInterestUSD, longOpenInterestAtEnd: totalOpenInterestUSD, shortOpenInterestAtEnd: totalOpenInterestUSD };
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.OPTIMISM],
  start: '2023-04-22',
  runAtCurrTime: true,
};

export default adapter;

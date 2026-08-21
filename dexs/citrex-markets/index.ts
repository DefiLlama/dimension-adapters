import BigNumber from "bignumber.js";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const URL = "https://api.citrex.markets/v1/ticker/24hr";

interface ResponseItem {
  fundingRateHourly: string;
  fundingRateYearly: string;
  high: string;
  low: string;
  markPrice: string;
  nextFundingTime: string;
  openInterest: string;
  oraclePrice: string;
  priceChange: string;
  priceChangePercent: string;
  productId: number;
  productSymbol: string;
  volume: string;
}

const fetch = async (options: FetchOptions) => {
  const response: ResponseItem[] = await httpGet(URL);

  // Divide by 10^18 to convert from min units to USDC human-readable as per the contract
  const baseUnit = new BigNumber(10).pow(18);

  const dailyVolume = options.createBalances();
  let openInterest = new BigNumber(0);
  for (const item of response) {
    const baseAsset = item.productSymbol.replace(/perp$/i, "").toUpperCase(); // "btcperp" -> "BTC"
    dailyVolume.addUSDValue(new BigNumber(item.volume).div(baseUnit).toNumber(), { id: baseAsset, isUSDValue: true });
    openInterest = openInterest.plus(item.openInterest);
  }

  return {
    dailyVolume,
    openInterestAtEnd: openInterest.div(baseUnit),
  };
};

const adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SEI],
  start: "2025-02-18",
  runAtCurrTime: true,
};

export default adapter;

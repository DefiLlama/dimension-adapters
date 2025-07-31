import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chains: { [key: string]: string } = {
  [CHAIN.CRONOS]: "CRONOS",
  [CHAIN.CRONOS_ZKEVM]: "CRONOS_ZKEVM",
};

const MoonlanderAddress: { [key: string]: string } = {
  [CHAIN.CRONOS]: "0xE6F6351fb66f3a35313fEEFF9116698665FBEeC9",
  [CHAIN.CRONOS_ZKEVM]: "0x02ae2e56bfDF1ee4667405eE7e959CD3fE717A05",
};

const startTimestamps: { [chain: string]: string } = {
  [CHAIN.CRONOS]: "2025-04-29",
  [CHAIN.CRONOS_ZKEVM]: "2024-12-17",
};

const pairsAbi =
  "function pairsV4() view returns ((string name, address base, uint16 basePosition, uint8 pairType, uint8 status, uint256 maxLongOiUsd, uint256 maxShortOiUsd, uint256 fundingFeePerSecondP, uint256 minFundingFeeR, uint256 maxFundingFeeR, (uint256 notionalUsd, uint16 tier, uint16 maxLeverage, uint16 initialLostP, uint16 liqLostP)[] leverageMargins, uint16 slippageConfigIndex, uint16 slippagePosition, (string name, uint256 onePercentDepthAboveUsd, uint256 onePercentDepthBelowUsd, uint16 slippageLongP, uint16 slippageShortP, uint16 index, uint8 slippageType, bool enable, uint256 longThresholdUsd, uint256 shortThresholdUsd) slippageConfig, uint16 feeConfigIndex, uint16 feePosition, (string name, uint16 index, uint16 openFeeP, uint16 closeFeeP, bool enable, uint24 shareP, uint24 minCloseFeeP) feeConfig, uint40 longHoldingFeeRate, uint40 shortHoldingFeeRate)[])";
const marketInfoAbi =
  "function getMarketInfos(address[] pairBases) view returns ((address pairBase, uint256 longQty, uint256 shortQty, uint128 lpLongAvgPrice, uint128 lpShortAvgPrice, int256 fundingFeeRate)[])";
const priceAbi = "function getPrice(address token) view returns (uint256)";

const dailyEndpoint =
  "https://api.moonlander.trade/v1/trading-volumes/sum-by-date";
const feesEndPoint = "https://api.moonlander.trade/v1/defillama/fee";

const getDailyUri = ({ chain, startTime, endTime }: any) => {
  return `${dailyEndpoint}?chains=${
    chains[chain]
  }&startTime=${startTime.toISOString()}&endTime=${endTime.toISOString()}`;
};

const getFeesUri = ({ chain, startTime, endTime }: any) => {
  return `${feesEndPoint}?block_chain=${
    chains[chain]
  }&startDate=${startTime.toISOString()}&endDate=${endTime.toISOString()}`;
};

const getOpenInterest = async ({
  chain,
  api,
}: Pick<FetchOptions, "chain" | "api">) => {
  const pairs = await api.call({
    target: MoonlanderAddress[chain],
    abi: pairsAbi,
  });
  const pairBases = pairs.map((pair: any) => pair.base);

  const pairsMarketInfo = await api.call({
    target: MoonlanderAddress[chain],
    abi: marketInfoAbi,
    params: [pairBases],
  });

  const pairPrices = await api.multiCall({
    abi: priceAbi,
    calls: pairs.map((pair: any) => ({
      target: MoonlanderAddress[chain],
      params: pair.base,
    })),
    permitFailure: true,
  });

  let totalLongOIUsd = 0,
    totalShortOIUsd = 0;

  pairPrices.forEach((pairPrice, index) => {
    const longOI = pairsMarketInfo[index].longQty / 1e10; // qty is 10 decimals
    const shortOI = pairsMarketInfo[index].shortQty / 1e10; // qty is 10 decimals

    const longOIUsd = longOI * (pairPrice / 1e18); // convert to USD, price is 18 decimals
    const shortOIUsd = shortOI * (pairPrice / 1e18); // convert to USD, price is 18 decimals

    totalLongOIUsd += longOIUsd;
    totalShortOIUsd += shortOIUsd;
  });

  return {
    longOpenInterestAtEnd: totalLongOIUsd,
    shortOpenInterestAtEnd: totalShortOIUsd,
    openInterestAtEnd: totalLongOIUsd + totalShortOIUsd,
  };
};

interface DailyDateAPIResponse {
  vol: string;
  usdVol: string;
}

interface FeesAPIResponse {
  dailyFeeAmountUsd: number;
}

async function fetch({
  startTimestamp,
  endTimestamp,
  chain,
  api,
}: FetchOptions) {
  const dailyData: DailyDateAPIResponse = await httpGet(
    getDailyUri({
      chain,
      startTime: new Date(startTimestamp * 1000),
      endTime: new Date(endTimestamp * 1000),
    })
  );

  const dailyFeesData: FeesAPIResponse = await httpGet(
    getFeesUri({
      chain,
      startTime: new Date(startTimestamp * 1000),
      endTime: new Date(endTimestamp * 1000),
    })
  );

  const { shortOpenInterestAtEnd, longOpenInterestAtEnd, openInterestAtEnd } =
    await getOpenInterest({ chain, api });

  return {
    dailyVolume: dailyData.usdVol,
    shortOpenInterestAtEnd,
    longOpenInterestAtEnd,
    openInterestAtEnd,
    dailyFees: dailyFeesData.dailyFeeAmountUsd,
  };
}

const adapter: any = {};

Object.keys(chains).forEach(
  (chain) => (adapter[chain] = { fetch, start: startTimestamps[chain] })
);

export default {
  adapter,
  version: 2,
};

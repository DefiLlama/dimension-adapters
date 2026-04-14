import { httpGet, httpPost } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const CONFIG = {
  [CHAIN.CRONOS]: {
    chainName: "CRONOS",
    start: "2025-04-29",
    address: "0xE6F6351fb66f3a35313fEEFF9116698665FBEeC9",
    excludeFilters: [
      {
        pairBase: "0xbad4ccc91ef0dfffbcab1402c519601fbaf244ef", // 500BTC pair address
        excludeStartTime: "2025-07-08T09:00:00.000Z", // Jul 8 5:00pm HKT
        excludeEndTime: "2025-07-29T09:00:00.000Z", // Jul 29 5:00pm HKT
      },
    ],
  },
  [CHAIN.CRONOS_ZKEVM]: {
    chainName: "CRONOS_ZKEVM",
    start: "2024-12-17",
    address: "0x02ae2e56bfDF1ee4667405eE7e959CD3fE717A05",
    excludeFilters: [], // No need to remove zkEVM's
  },
};

const pairsAbi =
  "function pairsV4() view returns ((string name, address base, uint16 basePosition, uint8 pairType, uint8 status, uint256 maxLongOiUsd, uint256 maxShortOiUsd, uint256 fundingFeePerSecondP, uint256 minFundingFeeR, uint256 maxFundingFeeR, (uint256 notionalUsd, uint16 tier, uint16 maxLeverage, uint16 initialLostP, uint16 liqLostP)[] leverageMargins, uint16 slippageConfigIndex, uint16 slippagePosition, (string name, uint256 onePercentDepthAboveUsd, uint256 onePercentDepthBelowUsd, uint16 slippageLongP, uint16 slippageShortP, uint16 index, uint8 slippageType, bool enable, uint256 longThresholdUsd, uint256 shortThresholdUsd) slippageConfig, uint16 feeConfigIndex, uint16 feePosition, (string name, uint16 index, uint16 openFeeP, uint16 closeFeeP, bool enable, uint24 shareP, uint24 minCloseFeeP) feeConfig, uint40 longHoldingFeeRate, uint40 shortHoldingFeeRate)[])";
const marketInfoAbi =
  "function getMarketInfos(address[] pairBases) view returns ((address pairBase, uint256 longQty, uint256 shortQty, uint128 lpLongAvgPrice, uint128 lpShortAvgPrice, int256 fundingFeeRate)[])";
const priceAbi = "function getPrice(address token) view returns (uint256)";

const BASE_API_URL = "https://api.moonlander.trade/v1/defillama";
const VOLUME_ENDPOINT = `${BASE_API_URL}/volume`;
const FEES_ENDPOINT = `${BASE_API_URL}/fee`;

const getDailyVolumeData = async ({ chain, startTime, endTime }: any) => {
  const requestBody = {
    chains: [CONFIG[chain].chainName],
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    exclusionFilters: CONFIG[chain].excludeFilters,
  };

  return await httpPost(VOLUME_ENDPOINT, requestBody);
};

const getFeesUri = ({ chain, startTime, endTime }: any) => {
  return `${FEES_ENDPOINT}?block_chain=${
    CONFIG[chain].chainName
  }&startDate=${startTime.toISOString()}&endDate=${endTime.toISOString()}`;
};

const getOpenInterest = async ({
  chain,
  api,
}: Pick<FetchOptions, "chain" | "api">) => {
  const pairs = await api.call({
    target: CONFIG[chain].address,
    abi: pairsAbi,
  });
  const pairBases = pairs.map((pair: any) => pair.base);

  const pairsMarketInfo = await api.call({
    target: CONFIG[chain].address,
    abi: marketInfoAbi,
    params: [pairBases],
  });

  const pairPrices = await api.multiCall({
    abi: priceAbi,
    calls: pairs.map((pair: any) => ({
      target: CONFIG[chain].address,
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
  const dailyData: DailyDateAPIResponse = await getDailyVolumeData({
    chain,
    startTime: new Date(startTimestamp * 1000),
    endTime: new Date(endTimestamp * 1000),
  });

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

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.fromEntries(
    Object.entries(CONFIG).map(([chain, config]) => [
      chain,
      {
        fetch: (options: FetchOptions) => fetch({ ...options, chain }),
        start: config.start,
      },
    ])
  ),
};

export default adapter;

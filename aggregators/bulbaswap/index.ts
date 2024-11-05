import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const v2Fees = 0.0035;

// V2 endpoints
const v2Endpoints = "https://api.bulbaswap.io/v1/subgraph-apis/v2";

// V3 endpoints
const v3Endpoints = "https://api.bulbaswap.io/v1/subgraph-apis/v3";

// GraphQL queries
const factoryQuery = `{
  uniswapFactory(id: "0x8D2A8b8F7d200d75Bf5F9E84e01F9272f90EFB8b") {
    totalLiquidityUSD
    totalVolumeUSD
    txCount
  }
  uniswapDayDatas(first: 1, orderBy:date, orderDirection:desc) {
    dailyVolumeUSD
    date
  }
}`;

const v3FactoryQuery = `{
  factory(id: "0xFf8578C2949148A6F19b7958aE86CAAb2779CDDD") {
    totalValueLockedUSD
    totalVolumeUSD
    totalFeesUSD
    txCount
  }
  uniswapDayDatas(first: 1, orderBy: date, orderDirection: desc) {
    volumeUSD
    feesUSD
  }
}`;

// V2 fetch function
const fetchV2Data = async () => {
  const response = await httpPost(v2Endpoints, {
    query: factoryQuery,
  });

  const totalVolume = response.data.uniswapFactory?.totalVolumeUSD || "0";
  const dailyVolume = response.data.uniswapDayDatas[0]?.dailyVolumeUSD || "0";
  const timestamp =
    response.data.uniswapDayDatas[0]?.date || Math.floor(Date.now() / 1000);

  const result = {
    totalVolume,
    dailyVolume,
    dailyFees: (Number(dailyVolume) * v2Fees).toString(),
    totalFees: (Number(totalVolume) * v2Fees).toString(),
    timestamp,
  };

  return result;
};

// V3 fetch function
const fetchV3Data = async () => {
  const response = await httpPost(v3Endpoints, {
    query: v3FactoryQuery,
  });

  const factory = response.data.factory || {};
  const dayData = response.data.uniswapDayDatas[0] || {};

  return {
    dailyVolume: dayData.volumeUSD || "0",
    totalVolume: factory.totalVolumeUSD || "0",
    dailyFees: dayData.feesUSD || "0",
    totalFees: factory.totalFeesUSD || "0",
  };
};

const fetch = async () => {
  // Get V2 data
  const v2Data = await fetchV2Data();

  // Get V3 data
  const v3Data = await fetchV3Data();

  // Merge data
  return {
    timestamp: v2Data.timestamp,
    totalVolume: (
      Number(v2Data.totalVolume || 0) + Number(v3Data.totalVolume || 0)
    ).toString(),
    dailyVolume: (
      Number(v2Data.dailyVolume || 0) + Number(v3Data.dailyVolume || 0)
    ).toString(),
    dailyFees: (
      Number(v2Data.dailyFees || 0) + Number(v3Data.dailyFees || 0)
    ).toString(),
    totalFees: (
      Number(v2Data.totalFees || 0) + Number(v3Data.totalFees || 0)
    ).toString(),
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MORPH]: {
      fetch,
      start: 1729591543,
    },
  },
};

export default adapter;

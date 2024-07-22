import { postURL } from "../../utils/fetchURL"
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const GRAPHQL_ENDPOINT = 'https://api.dedust.io/v3/graphql';

const POOLS_QUERY = `
query GetPools($filter: PoolsFiltersInput) {
    pools(filter: $filter) {
      address
      totalSupply
      type
      tradeFee
      assets
      reserves
      fees
      volume
    }
  }
`;

const ASSETS_QUERY = `
query GetAssets {
    assets {
      type
      address
      symbol
      decimals
      price
    }
  }
`;


const fetch = async (options: FetchOptions) => {
  console.log("Requesting assets list")
  const assetsList = (await postURL(GRAPHQL_ENDPOINT, {
    query: ASSETS_QUERY,
    operationName: 'GetAssets'
  })).data.assets;

  const assetInfo = {};
  for (const asset of assetsList) {
    const address = asset.type == 'native' ? 'native' : 'jetton:' + asset.address;
    assetInfo[address] = {
      decimals: asset.decimals,
      price: Number(asset.price),
      symbol: asset.symbol
    }
  }
  console.log(`Inited ${Object.keys(assetInfo).length} assets`);

  console.log("Requesting pools list")
  const poolsList = (await postURL(GRAPHQL_ENDPOINT, {
    query: POOLS_QUERY,
    operationName: 'GetPools'
  })).data.pools;

  let dailyVolume = 0;
  for (const pool of poolsList) {
    const address = pool.address;
    const leftAddr = pool.assets[0];
    const rightAddr = pool.assets[1];
    if (!(leftAddr in assetInfo && rightAddr in assetInfo)) {
      console.warn("No assets info for pool", pool);
      continue;
    }
    const left = assetInfo[leftAddr];
    const right = assetInfo[rightAddr];

    dailyVolume += (left.price * Number(pool.volume[0]) / Math.pow(10, left.decimals)
      + right.price * Number(pool.volume[1]) / Math.pow(10, right.decimals)) / 2;
  }

  return {
    dailyVolume: dailyVolume
  };
};


const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      runAtCurrTime: true,
      start: 1681931480,
    },
  },
};

export default adapter;

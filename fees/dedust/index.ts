import { FetchOptions, FetchResultV2 } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains'
import { postURL } from "../../utils/fetchURL"
import { METRIC } from '../../helpers/metrics';

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

// LPs get 80% of fees
const FEES_PERCENT_TO_LP = 0.8;

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const assetsList = (await postURL(GRAPHQL_ENDPOINT, {
    query: ASSETS_QUERY,
    operationName: 'GetAssets'
  })).data.assets;

  const assetInfo: any = {};
  for (const asset of assetsList) {
    const address = asset.type == 'native' ? 'native' : 'jetton:' + asset.address;
    assetInfo[address] = {
      decimals: asset.decimals,
      price: Number(asset.price),
      symbol: asset.symbol
    }
  }

  const poolsList = (await postURL(GRAPHQL_ENDPOINT, {
    query: POOLS_QUERY,
    operationName: 'GetPools'
  })).data.pools;

  let swapFees = 0;
  for (const pool of poolsList) {
    const leftAddr = pool.assets[0];
    const rightAddr = pool.assets[1];
    if (!(leftAddr in assetInfo && rightAddr in assetInfo)) {
      console.warn("No assets info for pool", pool);
      continue;
    }
    const left = assetInfo[leftAddr];
    const right = assetInfo[rightAddr];

    swapFees += (left.price * Number(pool.fees[0]) / Math.pow(10, left.decimals)
      + right.price * Number(pool.fees[1]) / Math.pow(10, right.decimals)) / 2;
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addUSDValue(swapFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(swapFees * (1 - FEES_PERCENT_TO_LP), METRIC.PROTOCOL_FEES);
  dailySupplySideRevenue.addUSDValue(swapFees * FEES_PERCENT_TO_LP, METRIC.LP_FEES);

  return {
    dailyUserFees: dailyFees,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  }
}

const methodology = {
  Fees: "Swap fees paid by users, ranging from 0.1% to 1% depending on the pool.",
  UserFees: "User pays fee on each swap (depends on pool, 0.1% - 1%).",
  Revenue: "Protocol receives 20% of fees, it is distributed among DUST stakers.",
  SupplySideRevenue: "80% of user fees are distributed among LPs.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees paid by users on token swaps, ranging from 0.1% to 1% depending on the liquidity pool"
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "20% of swap fees distributed to DUST token stakers as protocol revenue"
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "80% of swap fees distributed to liquidity providers who supply capital to pools"
  }
}

export default {
  version: 2,
  chains: [CHAIN.TON],
  fetch,
  //start: '2023-11-14',
  methodology,
  breakdownMethodology,
  runAtCurrTime: true,
}

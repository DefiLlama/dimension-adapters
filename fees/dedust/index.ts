import { FetchResultV2 } from '../../adapters/types';
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
const fetchFees = async (): Promise<FetchResultV2> => {
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

    const poolsList = (await postURL(GRAPHQL_ENDPOINT, {
        query: POOLS_QUERY,
        operationName: 'GetPools'
    })).data.pools;

    let swapFees = 0;
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

        swapFees += (left.price * Number(pool.fees[0]) / Math.pow(10, left.decimals)
            + right.price * Number(pool.fees[1]) / Math.pow(10, right.decimals)) / 2;
    }


    return {
        dailyUserFees: swapFees,
        dailyFees: swapFees,
        dailySupplySideRevenue: swapFees * FEES_PERCENT_TO_LP,
        dailyRevenue: swapFees * (1 - FEES_PERCENT_TO_LP)
    }
}

const methodology = {
    UserFees: "User pays fee on each swap (depends on pool, 0.1% - 1%).",
    Revenue: "Protocol receives 20% of fees, it is distributed among DUST stakers.",
    SupplySideRevenue: "80% of user fees are distributed among LPs.",
}

const breakdownMethodology = {
    UserFees: {
        [METRIC.SWAP_FEES]: "Fees paid by users on token swaps, ranging from 0.1% to 1% depending on the liquidity pool"
    },
    Fees: {
        [METRIC.SWAP_FEES]: "Total swap fees collected from all token swaps across DeDust liquidity pools"
    },
    Revenue: {
        "DUST staker rewards": "20% of swap fees distributed to DUST token stakers as protocol revenue"
    },
    SupplySideRevenue: {
        [METRIC.LP_FEES]: "80% of swap fees distributed to liquidity providers who supply capital to pools"
    }
}

export default {
    version: 2,
    chains: [CHAIN.TON],
    fetch: fetchFees,
    start: '2023-11-14',
    methodology,
    breakdownMethodology,
}

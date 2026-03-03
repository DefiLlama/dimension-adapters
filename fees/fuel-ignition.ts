import { SimpleAdapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet, httpPost } from "../utils/fetchURL";

const INDEXER_URL = "https://indexer-fuel-seq.simplystaking.xyz";
const EXPLORER_URL = "https://explorer-indexer-mainnet.fuel.network/graphql";

interface BlobFeesResponse {
  totalFees: string;
  feeDenom: string;
  decimals: number;
  blobCount: number;
  startTimestamp: number;
  endTimestamp: number;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  
  const url = `${INDEXER_URL}/seq/blob-fees?start=${options.fromTimestamp}&end=${options.toTimestamp}`;
  const res: BlobFeesResponse = await httpGet(url);

  const dataResponse = await httpPost(EXPLORER_URL, {
    query: `
      query statistics {
        statistics {
          nodes {
            totalFee {
              date
              value
              valueInUsd
            }
          }
        }
      }
    `
  }, {
    headers: {
      authorization: 'Basic ZnVlbGRldjE6MXBkZGtp' + 'WGhMYlZESW1DZG1UNUhhdw==',
      'x-api-key': 'Bearer nZ9GZ' + 'ayrd8',
    }
  });
  
  let totalGasSpent = 0;
  for (const item of dataResponse.data.statistics.nodes.totalFee) {
    totalGasSpent += Number(item.value);
  }
  
  // total gas spent in ETH, numbers are in 9 decimals
  dailyFees.addCGToken('ethereum', totalGasSpent / 1e9);
  
  // totalFees is in smallest unit (10^9 = 1 FUEL)
  const fuelBlobFees = Number(res.totalFees) / Math.pow(10, res.decimals);
  dailyRevenue.addCGToken("fuel-network", fuelBlobFees);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  runAtCurrTime: true,
  adapter: {
    [CHAIN.FUEL]: {
      fetch,
      start: '2024-11-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;

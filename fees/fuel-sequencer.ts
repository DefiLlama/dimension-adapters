import { SimpleAdapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const INDEXER_URL = "https://indexer-fuel-seq.simplystaking.xyz";

interface BlobFeesResponse {
  totalFees: string;
  feeDenom: string;
  decimals: number;
  blobCount: number;
  startTimestamp: number;
  endTimestamp: number;
}

const fetchFees = async (options: FetchOptions) => {
  const url = `${INDEXER_URL}/seq/blob-fees?start=${options.fromTimestamp}&end=${options.toTimestamp}`;
  const res: BlobFeesResponse = await httpGet(url);

  // totalFees is in smallest unit (10^9 = 1 FUEL)
  const feesInFuel = Number(res.totalFees) / Math.pow(10, res.decimals);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("fuel-network", feesInFuel);

  return {
    dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FUEL]: {
      fetch: fetchFees,
      start: '2024-11-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;

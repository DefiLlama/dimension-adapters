import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface Transaction {
  fee: string;
  timestamp: number;
  // Add other fields as needed
}

// Multiple API sources for Chia block data
const API_SOURCES = [
  {
    name: 'xchscan',
    url: 'https://xchscan.com/api/blocks?limit=50&offset=0',
    dataPath: 'blocks',
    timestampField: 'transaction_timestamp',
    feeField: 'transaction_fees'
  },
  {
    name: 'chiaexplorer',
    url: 'https://chiaexplorer.com/api/blocks?limit=50',
    dataPath: 'blocks',
    timestampField: 'timestamp',
    feeField: 'fees'
  },
  {
    name: 'spacefarmers',
    url: 'https://api2.spacefarmers.io/blocks?limit=50',
    dataPath: 'blocks',
    timestampField: 'timestamp',
    feeField: 'fees'
  },
  {
    name: 'alltheblocks',
    url: 'https://api.alltheblocks.net/chia/blocks?limit=50',
    dataPath: 'blocks',
    timestampField: 'timestamp',
    feeField: 'fee'
  }
];

const fetchFromApi = async (apiSource: typeof API_SOURCES[0], dayStart: number, dayEnd: number): Promise<number> => {
  console.log(`Trying Chia API: ${apiSource.name}`);
  const response = await httpGet(apiSource.url);

  if (!response || !response[apiSource.dataPath]) {
    throw new Error(`No ${apiSource.dataPath} data available from ${apiSource.name} API`);
  }

  const blocks: any[] = response[apiSource.dataPath];

  const dayBlocks = blocks.filter((block: any) => {
    const timestamp = block[apiSource.timestampField];
    return timestamp && timestamp >= dayStart / 1000 && timestamp < dayEnd / 1000;
  });

  const totalFeeMojos = dayBlocks.reduce((sum: number, block: any) => {
    const fee = block[apiSource.feeField];
    return sum + parseInt(fee || 0);
  }, 0);

  return totalFeeMojos / 1e12; // Convert mojos to XCH
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dayStart = options.startOfDay * 1000;
  const dayEnd = options.endTimestamp * 1000;
  const now = Date.now();

  // API limitations for historical data
  // Most Chia APIs only provide recent blocks (approximately last 10-14 days)
  const historicalLimit = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

  if (dayStart < now - historicalLimit) {
    // For data older than 14 days, most APIs don't provide block data
    console.log(`Historical fee data not available for ${new Date(dayStart).toISOString().slice(0, 10)} (API limitation - most Chia APIs only provide recent blocks)`);
    const dailyFees = options.createBalances();
    dailyFees.addCGToken('chia', 0);
    return { dailyFees };
  }

  // Try all API sources in parallel and return the first successful result
  const apiPromises = API_SOURCES.map(apiSource =>
    fetchFromApi(apiSource, dayStart, dayEnd).then(totalFeeXCH => ({
      apiSource,
      totalFeeXCH
    }))
  );

  const results = await Promise.allSettled(apiPromises);

  // Find the first fulfilled result
  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { apiSource, totalFeeXCH } = result.value;
      console.log(`Successfully fetched fee data from ${apiSource.name}: ${totalFeeXCH} XCH`);

      const dailyFees = options.createBalances();
      dailyFees.addCGToken('chia', totalFeeXCH);
      return { dailyFees };
    }
  }

  // All APIs failed - log the reasons
  const failedReasons = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason));

  console.log(`All Chia APIs failed. Reasons:`, failedReasons.join('; '));
  console.log(`Returning 0 fees for ${new Date(dayStart).toISOString().slice(0, 10)} due to API unavailability`);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('chia', 0);
  return { dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.CHIA],
  start: "2021-03-19", // Chia mainnet launch date
  protocolType: ProtocolType.CHAIN,
};

export default adapter;

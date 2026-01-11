import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface Transaction {
  fee: string;
  timestamp: number;
  // Add other fields as needed
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dayStart = options.startOfDay * 1000;
  const dayEnd = options.endTimestamp * 1000;
  const now = Date.now();

  // XCHscan API has limitations for historical data
  // It only provides recent blocks (approximately last 10-14 days)
  const historicalLimit = 14 * 24 * 60 * 60 * 1000; // 14 days in milliseconds

  if (dayStart < now - historicalLimit) {
    // For data older than 14 days, XCHscan API doesn't provide block data
    // This is a limitation of the current API
    console.log(`Historical fee data not available for ${new Date(dayStart).toISOString().slice(0, 10)} (XCHscan API limitation)`);
    const dailyFees = options.createBalances();
    dailyFees.addCGToken('chia', 0);
    return { dailyFees };
  }

  // For recent data within the API's available range, use blocks API
  // Note: XCHscan API may have timeout issues with larger requests
  const apiUrl = `https://xchscan.com/api/blocks?limit=50&offset=0`;
  const response = await httpGet(apiUrl);

  if (!response || !response.blocks) {
    console.log("No block data available from XCHscan API");
    const dailyFees = options.createBalances();
    dailyFees.addCGToken('chia', 0);
    return { dailyFees };
  }

  const blocks: any[] = response.blocks;

  const dayBlocks = blocks.filter((block: any) =>
    block.transaction_timestamp &&
    block.transaction_timestamp >= dayStart / 1000 &&
    block.transaction_timestamp < dayEnd / 1000
  );

  const totalFeeMojos = dayBlocks.reduce((sum: number, block: any) => {
    return sum + parseInt(block.transaction_fees || 0);
  }, 0);

  const totalFeeXCH = totalFeeMojos / 1e12;

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('chia', totalFeeXCH);

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

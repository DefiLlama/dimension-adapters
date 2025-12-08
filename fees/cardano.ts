import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet, httpPost } from "../utils/fetchURL";

const KOIOS_URL = 'https://api.koios.rest/api/v1';


const fetch = async (_t: any, _b: any, { createBalances, startTimestamp, endTimestamp }: FetchOptions) => {
  const dailyFees = createBalances();
  
  // 1. Get blocks for the day
  // Koios uses block_time in seconds
  const blocksUrl = `${KOIOS_URL}/blocks?_block_time=gte.${startTimestamp}&_block_time=lt.${endTimestamp}&select=hash`;
  const blocks: { hash: string }[] = await httpGet(blocksUrl);

  if (!blocks || blocks.length === 0) {
    return { dailyFees };
  }

  const blockHashes = blocks.map(b => b.hash);
  const BATCH_SIZE = 1000; // Koios limit
  let totalFees = 0;

  // 2. Get block info in batches
  for (let i = 0; i < blockHashes.length; i += BATCH_SIZE) {
    const batch = blockHashes.slice(i, i + BATCH_SIZE);
    const infoUrl = `${KOIOS_URL}/block_info`;
    const blockInfos: { total_fees: string }[] = await httpPost(infoUrl, { _block_hashes: batch });
    
    for (const info of blockInfos) {
      totalFees += Number(info.total_fees);
    }
  }

  // totalFees is in Lovelace (1e-6 ADA)
  dailyFees.addCGToken('cardano', totalFees / 1e6);
  const dailyRevenue = createBalances();
  dailyRevenue.addCGToken('cardano', (totalFees * 0.2) / 1e6);

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.CARDANO]: {
        fetch,
        start: '2020-01-01',
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN
}

export default adapter;

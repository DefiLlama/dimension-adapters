import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

interface Block {
  canonical: boolean;
  height: number;
  hash: string;
  block_time: number;
  tx_count: number;
}

interface Transaction {
  tx_id: string;
  fee_rate: string;
  tx_status: string;
  canonical: boolean;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  
  // Get blocks within the time range first
  const blocksInRange: number[] = [];
  let offset = 0;
  const limit = 20;
  
  while (true) {
    const blocksResponse = await httpGet(`https://api.hiro.so/extended/v2/blocks?limit=${limit}&offset=${offset}`);
    const blocks: Block[] = blocksResponse.results;
    
    if (!blocks || blocks.length === 0) break;
    
    let foundOlderBlock = false;
    for (const block of blocks) {
      if (block.block_time < options.startTimestamp) {
        foundOlderBlock = true;
        break;
      }
      
      if (block.block_time >= options.startTimestamp && 
          block.block_time < options.endTimestamp && 
          block.canonical &&
          block.tx_count > 0) {
        blocksInRange.push(block.height);
      }
    }
    
    if (foundOlderBlock) break;
    offset += limit;
    if (offset > 500) break; // Safety limit
  }
  
  // Now fetch transactions for each block and sum fees
  let totalFees = 0;
  for (const blockHeight of blocksInRange) {
    try {
      const txResponse = await httpGet(`https://api.hiro.so/extended/v2/blocks/${blockHeight}/transactions?limit=200`);
      const transactions: Transaction[] = txResponse.results;
      
      if (transactions) {
        for (const tx of transactions) {
          if (tx.tx_status === 'success' && tx.canonical && tx.fee_rate) {
            totalFees += parseInt(tx.fee_rate);
          }
        }
      }
    } catch (error) {
      console.log(`Error fetching transactions for block ${blockHeight}:`, error);
      // Continue with other blocks
    }
  }
  
  // Convert from microSTX to STX (1 STX = 1,000,000 microSTX)
  const feesInSTX = totalFees / 1_000_000;
  dailyFees.addGasToken(feesInSTX);
  
  return {
    timestamp: options.startOfDay,
    dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
      start: '2025-01-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total fees paid by users on Stacks blockchain',
    Revenue: 'Fees collected by the Stacks network',
  },
};

export default adapter;
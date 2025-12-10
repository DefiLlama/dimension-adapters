import { Fetch, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

/**
 * Tristero DEX Adapter
 * 
 * Tristero is a cross-chain market maker that fills swaps through its own smart contracts.
 * Tristero sources liquidity by performing opposite swaps on DEX aggregators (OpenOcean, 
 * Relay, Jupiter, etc.) to make markets for users.
 * 
 * This adapter tracks trading volume from OrderFilled events emitted by the v2_order_router contract.
 */

// Event signature for OrderFilled
const event_order_filled = 'event OrderFilled(bytes32 indexed orderUUID,string orderType,address target,address filler,address srcAsset,address dstAsset,uint256 srcQuantity,uint256 dstQuantity)';

// v2_order_router contract address (same across all chains)
const V2_ORDER_ROUTER_ADDRESS = '0x98888e2e040944cee3d7c8da22368aef18f5a3f4';

type TAddress = {
  [c: string]: string;
}

const address: TAddress = {
  [CHAIN.ETHEREUM]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.ARBITRUM]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.AVAX]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.BASE]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.OPTIMISM]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.POLYGON]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.LINEA]: V2_ORDER_ROUTER_ADDRESS,
}

const fetch = (async (timestamp: number, _: any, { getLogs, createBalances, chain, getFromBlock, getToBlock }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances();

  // Get explicit block range for the day
  const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()]);

  // Query OrderFilled events from the order router contract
  const logs = await getLogs({
    target: address[chain],
    eventAbi: event_order_filled,
    fromBlock,
    toBlock,
    onlyArgs: true,
  });

  // Debug: Log number of events found
  if (logs.length > 0) {
    console.log(`[Tristero ${chain}] Found ${logs.length} OrderFilled events`);
  }

  // Track volume from srcQuantity only (one side of the swap)
  // This is the standard DEX volume calculation method
  let processedCount = 0;
  logs.forEach((log: any) => {
    // Add source asset quantity only
    if (log.srcAsset && log.srcQuantity) {
      let tokenAddress = log.srcAsset.toLowerCase();
      // Handle native tokens - use wrapped token address
      if (tokenAddress === '0x0000000000000000000000000000000000000000' || tokenAddress === 'native') {
        const wrappedToken = ADDRESSES[chain as keyof typeof ADDRESSES]?.WETH || ADDRESSES[chain as keyof typeof ADDRESSES]?.WAVAX;
        if (wrappedToken) {
          tokenAddress = wrappedToken.toLowerCase();
        } else {
          return; // Skip if no wrapped token available
        }
      }
      dailyVolume.add(tokenAddress, log.srcQuantity);
      processedCount++;
    }
  });

  if (logs.length > 0) {
    console.log(`[Tristero ${chain}] Processed ${processedCount} events`);
  }

  return { 
    dailyVolume, 
    timestamp 
  };
}) as Fetch;

const methodology = {
  Volume: "Trading volume is calculated from OrderFilled events emitted by the v2_order_router contract. Volume is measured as the USD value of the source token quantity (srcQuantity) in each filled swap. This follows standard DEX volume calculation methodology by counting one side of each swap. Tristero fills swaps through its own smart contracts, sourcing liquidity from DEX aggregators.",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: { 
      fetch, 
      start: "2025-08-30",
    },
    [CHAIN.ARBITRUM]: { 
      fetch, 
      start: "2025-08-18",
    },
    [CHAIN.OPTIMISM]: { 
      fetch, 
      start: "2025-08-18",
    },
    [CHAIN.BASE]: { 
      fetch, 
      start: "2025-08-18",
    },
    [CHAIN.POLYGON]: { 
      fetch, 
      start: "2025-08-30",
    },
    [CHAIN.AVAX]: { 
      fetch, 
      start: "2025-08-18",
    },
    [CHAIN.LINEA]: { 
      fetch, 
      start: "2025-09-20",
    },
  },
  methodology,
};

export default adapter;

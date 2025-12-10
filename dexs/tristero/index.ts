import { Fetch, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
const V2_ORDER_ROUTER_ADDRESS = '0x98888821812DfEcD4deA8077682Ce2F3A7F39b25';

type TAddress = {
  [c: string]: string;
}

const address: TAddress = {
  [CHAIN.ETHEREUM]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.ARBITRUM]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.OPTIMISM]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.BASE]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.POLYGON]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.AVAX]: V2_ORDER_ROUTER_ADDRESS,
  [CHAIN.LINEA]: V2_ORDER_ROUTER_ADDRESS,
}

const fetch = (async (timestamp: number, _: any, { getLogs, createBalances, chain }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances();

  const logs = await getLogs({
    target: address[chain],
    eventAbi: event_order_filled,
  });

  // Track volume from both srcQuantity and dstQuantity
  // This captures the full trading volume (both sides of the swap)
  logs.forEach((log: any) => {
    // Add source asset quantity
    dailyVolume.add(log.srcAsset, log.srcQuantity);
    // Add destination asset quantity
    dailyVolume.add(log.dstAsset, log.dstQuantity);
  });

  return { 
    dailyVolume, 
    timestamp 
  };
}) as Fetch;

const methodology = {
  Volume: "Trading volume is calculated from OrderFilled events emitted by the v2_order_router contract. Volume includes both srcQuantity and dstQuantity from each filled order, representing the full trading volume across both sides of the swap. Tristero fills swaps through its own smart contracts, sourcing liquidity from DEX aggregators.",
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

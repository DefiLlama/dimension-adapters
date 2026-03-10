import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY_ADDRESS = "0xa28dBAE4D926067F4c343aA8071e833b04C8b99E";

const factoryAbi = {
  "allPairsLength": "function allPairsLength() view returns (uint256)",
  "allPairs": "function allPairs(uint256) view returns (address)"
};

const pairAbi = {
  "Swap": "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
  "token0": "function token0() view returns (address)",
  "token1": "function token1() view returns (address)"
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  
  // Get total number of pairs from factory
  const pairsLength = await options.api.call({
    target: FACTORY_ADDRESS,
    abi: factoryAbi.allPairsLength
  });
  
  // Get all pair addresses
  const pairCalls = [];
  for (let i = 0; i < Number(pairsLength); i++) {
    pairCalls.push({ target: FACTORY_ADDRESS, params: [i] });
  }
  
  const pairs = await options.api.multiCall({
    abi: factoryAbi.allPairs,
    calls: pairCalls
  });
  
  // For each pair, get token addresses and swap events
  for (const pairAddress of pairs) {
    const [token0, token1] = await Promise.all([
      options.api.call({ target: pairAddress, abi: pairAbi.token0 }),
      options.api.call({ target: pairAddress, abi: pairAbi.token1 })
    ]);
    
    // Get swap logs for this pair
    const swapLogs = await options.getLogs({
      target: pairAddress,
      eventAbi: pairAbi.Swap,
    });
    
    // Aggregate volume from swap events
    swapLogs.forEach((log: any) => {
      const amount0In = log.amount0In;
      const amount1In = log.amount1In;
      
      if (amount0In > 0) {
        dailyVolume.add(`base:${token0}`, amount0In);
      }
      if (amount1In > 0) {
        dailyVolume.add(`base:${token1}`, amount1In);
      }
    });
  }
  
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-03-09",
      meta: {
        methodology: {
          Volume: "Sum of all swap input amounts from Swap events across all Velox DEX pair contracts, dynamically fetched from the Factory using allPairs()",
        },
      },
    },
  },
};

export default adapter;

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY_ADDRESS = "0xa28dBAE4D926067F4c343aA8071e833b04C8b99E";

const factoryAbi = {
  allPairsLength: "function allPairsLength() view returns (uint256)",
  allPairs: "function allPairs(uint256) view returns (address)"
};

const pairAbi = {
  Swap: "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)",
  token0: "function token0() view returns (address)",
  token1: "function token1() view returns (address)"
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  
  // Get total number of pairs from factory
  const pairsLength = await options.api.call({
    target: FACTORY_ADDRESS,
    abi: factoryAbi.allPairsLength
  });
  
  if (Number(pairsLength) === 0) {
    return { dailyVolume };
  }
  
  // Get all pair addresses in one batch call
  const pairCalls = [];
  for (let i = 0; i < Number(pairsLength); i++) {
    pairCalls.push({ target: FACTORY_ADDRESS, params: [i] });
  }
  
  const pairs: string[] = await options.api.multiCall({
    abi: factoryAbi.allPairs,
    calls: pairCalls
  });
  
  // Batch fetch token0 and token1 for all pairs
  const token0Calls = pairs.map(pair => ({ target: pair }));
  const token1Calls = pairs.map(pair => ({ target: pair }));
  
  const [token0Results, token1Results] = await Promise.all([
    options.api.multiCall({ abi: pairAbi.token0, calls: token0Calls }),
    options.api.multiCall({ abi: pairAbi.token1, calls: token1Calls })
  ]);
  
  // Create mapping of pair address to tokens
  const pairTokens: Record<string, { token0: string; token1: string }> = {};
  pairs.forEach((pair, i) => {
    pairTokens[pair.toLowerCase()] = {
      token0: token0Results[i],
      token1: token1Results[i]
    };
  });
  
  // Get swap logs for all pairs using getLogs with targets array
  const swapLogs = await options.getLogs({
    targets: pairs,
    eventAbi: pairAbi.Swap,
  });
  
  // Aggregate volume from swap events
  swapLogs.forEach((log: any) => {
    const pairAddress = log.address?.toLowerCase();
    const tokens = pairTokens[pairAddress];
    
    if (!tokens) return;
    
    const amount0In = log.amount0In;
    const amount1In = log.amount1In;
    
    if (amount0In > 0) {
      dailyVolume.add(tokens.token0, amount0In);
    }
    if (amount1In > 0) {
      dailyVolume.add(tokens.token1, amount1In);
    }
  });
  
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-03-08",
      meta: {
        methodology: {
          Volume: "Sum of all swap input amounts from Swap events across all Velox DEX pair contracts, dynamically fetched from the Factory using allPairs()",
        },
      },
    },
  },
};

export default adapter;

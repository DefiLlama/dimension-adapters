import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const DEPLOYERS = {
  Hyperliquid: null,
  'trade.xyz': 'xyz',
  Felix: 'flx',
  Ventuals: 'vntl',
  hyENA: 'hyna',
  Markets: 'km',
};

interface ContextItem {
  openInterest: string;
  markPx: string;
}

interface ApiResponse {
  [0]: {
    universe: Array<{ name: string }>;
  };
  [1]: ContextItem[];
}

async function fetchDeployerOpenInterest(dexParam: string | null): Promise<number> {
  const url = 'https://api.hyperliquid.xyz/info';
  const body: any = {
    type: 'metaAndAssetCtxs'
  };
  
  if (dexParam) {
    body.dex = dexParam;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data: ApiResponse = await response.json();
  const contexts = data[1] || [];

  const totalOI = contexts.reduce((sum, ctx) => {
    const oi = parseFloat(ctx.openInterest || '0');
    const markPrice = parseFloat(ctx.markPx || '0');
    return sum + (oi * markPrice);
  }, 0);

  return totalOI;
}

const fetchOpenInterest = async (timestamp: number, _: any, options: FetchOptions) => {
  let totalOI = 0;
  const breakdown: { [key: string]: number } = {};
  
  for (const [deployerName, dexParam] of Object.entries(DEPLOYERS)) {
    try {
      const oi = await fetchDeployerOpenInterest(dexParam);
      breakdown[deployerName] = oi;
      totalOI += oi;
    } catch (error) {
      console.error(`Error fetching OI for ${deployerName}:`, error);
      breakdown[deployerName] = 0;
    }
  }

  console.log('Open Interest Breakdown by Deployer:');
  Object.entries(breakdown).forEach(([name, value]) => {
    console.log(`  ${name}: $${value.toLocaleString()}`);
  });
  console.log(`  Total: $${totalOI.toLocaleString()}`);

  return {
    timestamp,
    openInterestAtEnd: totalOI,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: fetchOpenInterest,
      start: '2025-10-13',
    },
  },
  version: 2,
};

export default adapter;
import axios from "axios";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getEnv } from "../../helpers/env";
import { getConfig } from "../../helpers/cache";

const BASE_URL = "https://api.onyx.enzyme.finance";
const LIST_URL = "https://api.enzyme.finance/enzyme.enzyme.v1.EnzymeService/GetVaultList";

const API_KEY = getEnv('ENZYME_API_KEY');

const getVaultList = async () => {
  const data = await getConfig('enzyme-vaults', '', {
    fetcher: async () => {
      const response = await axios.post(
        LIST_URL,
        {},
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      return response.data;
    }
  });
  
  return data.vaults || [];
};

const getVaultConfig = async (address: string) => {
  const data = await getConfig(`enzyme-vaults-${address}`, '', {
    fetcher: async () => {
      const response = await axios.get(
        `${BASE_URL}/vaults/${address}/configuration`,
        { headers: { Authorization: `Bearer ${API_KEY}` } }
      );
      return response.data;
    }
  });
  
  return data;
};

// Fetch fees for a single tracker
const getFeeTrackerData = async (vault: any, handler: string, tracker: string) => {
  try {
    const { data } = await axios.get(
      `${BASE_URL}/vaults/${vault.address}/components/${tracker}/${handler}`,
      { headers: { Authorization: `Bearer ${API_KEY}` } }
    );
    return BigInt(data.totalFeesSettled || 0);
  } catch (error) {
    return BigInt(0);
  }
};

const getVaultSettledFees = async (vault: any) => {
  try {
    const config = await getVaultConfig(vault.address);
    if (!config?.feeHandler) return 0;
    
    const handler = config.feeHandler;
    const trackers = [
      "continuous-flat-rate-performance-fee-tracker",
      "continuous-flat-rate-management-fee-tracker",
    ];
    
    // Fetch both trackers in parallel
    const feeResults = await Promise.all(
      trackers.map(tracker => getFeeTrackerData(vault, handler, tracker))
    );
    
    const total = feeResults.reduce((sum, fee) => sum + fee, BigInt(0));
    
    return Number(total);
  } catch (error) {
    return 0;
  }
};

// Process vaults in batches to avoid overwhelming the API
const processBatch = async (vaults: any[], batchSize: number = 20) => {
  const results: number[] = [];
  
  for (let i = 0; i < vaults.length; i += batchSize) {
    const batch = vaults.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(vault => getVaultSettledFees(vault))
    );
    
    results.push(...batchResults);
    
    // Rate limiting between batches
    if (i + batchSize < vaults.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  return results;
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const vaults = await getVaultList();
  
  // Process all vaults in parallel batches
  const feeResults = await processBatch(vaults, 20);
  
  // Calculate totals
  const totalEth = feeResults.reduce((sum, value) => sum + value, 0);
  const activeVaults = feeResults.filter(value => value > 0).length;
  
  console.log(`Processed ${vaults.length} vaults, ${activeVaults} active with fees`);
  
  const dailyFees = options.createBalances();
  dailyFees.addGasToken(totalEth);
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2022-01-01',
    },
  },
  methodology: {
    Fees: "Reads settled performance + management fees from Enzyme fee handler trackers.",
    Revenue: "Uses totalFeesSettled as realized revenue.",
    ProtocolRevenue: "Uses totalFeesSettled as realized revenue.",
  },
};

export default adapter;
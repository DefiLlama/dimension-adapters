import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// EOS REX contract
const REX_CONTRACT = "eosio";
const EOS_ENDPOINTS = [
  "https://eos.api.eosnation.io",
  "https://api.eosdetroit.io",
  "https://api.main.alohaeos.com",
  "https://eos.eosphere.io",
  "https://api.eoseoul.io",
  "https://bp.cryptolions.io",
  "https://api.eosnewyork.io"
];

interface REXPool {
  version: number;
  total_lendable: string;
  total_lent: string;
  total_unlent: string;
  total_rent: string;
  total_rex: string;
  namebid_proceeds: string;
  loan_num: number;
}

interface REXReturnPool {
  version: number;
  last_dist_time: string;
  pending_bucket_time: string;
  oldest_bucket_time: string;
  pending_bucket_proceeds: string;
  current_rate_of_increase: string;
  proceeds: string;
}

interface REXFund {
  version: number;
  owner: string;
  balance: string;
}

// Convert EOS amount string to number
function eosToNumber(amount: string): number {
  if (!amount) return 0;
  const parts = amount.split(" ");
  return parseFloat(parts[0]);
}

// Fetch EOS price in USD from CoinGecko API
async function getEOSPrice(): Promise<number> {
  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=eos&vs_currencies=usd",
      {
        headers: {
          "Accept": "application/json"
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch EOS price`);
    }
    
    const data = await response.json();
    const price = data.eos?.usd;
    
    if (!price || price <= 0) {
      throw new Error("Invalid EOS price received");
    }
    
    return price;
  } catch (error) {
    console.error("Error fetching EOS price:", error);
    throw error;
  }
}

// Fetch data from EOS blockchain with fallback
async function fetchFromEOS(endpoint: string, body: any): Promise<any> {
  try {
    const response = await fetch(`${endpoint}/v1/chain/get_table_rows`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    
    if (!data.rows || data.rows.length === 0) {
      throw new Error(`No data returned from ${endpoint}`);
    }
    
    return data;
  } catch (error) {
    console.error(`Error fetching from ${endpoint}:`, error);
    throw error;
  }
}

// Try multiple endpoints with fallback
async function fetchWithFallback(body: any): Promise<any> {
  for (const endpoint of EOS_ENDPOINTS) {
    try {
      return await fetchFromEOS(endpoint, body);
    } catch (error) {
      console.log(`Failed to fetch from ${endpoint}, trying next...`);
      continue;
    }
  }
  throw new Error("All EOS endpoints failed");
}

// Get REX pool data
async function getREXPool(): Promise<REXPool | null> {
  const data = await fetchWithFallback({
    json: true,
    code: REX_CONTRACT,
    scope: REX_CONTRACT,
    table: "rexpool",
    limit: 1,
  });
  
  return data.rows && data.rows.length > 0 ? data.rows[0] : null;
}

// Get REX return pool data (for calculating APR and flows)
async function getREXReturnPool(): Promise<REXReturnPool | null> {
  const data = await fetchWithFallback({
    json: true,
    code: REX_CONTRACT,
    scope: REX_CONTRACT,
    table: "rexretpool",
    limit: 1,
  });
  
  return data.rows && data.rows.length > 0 ? data.rows[0] : null;
}

// Get historical REX balance for a specific account (for testing)
async function getREXBalance(account: string): Promise<REXFund | null> {
  const data = await fetchWithFallback({
    json: true,
    code: REX_CONTRACT,
    scope: REX_CONTRACT,
    table: "rexfund",
    lower_bound: account,
    upper_bound: account,
    limit: 1,
  });
  
  return data.rows && data.rows.length > 0 ? data.rows[0] : null;
}

// Calculate APR from REX return data
function calculateAPR(rexPool: REXPool, rexReturn: REXReturnPool): number {
  const totalRent = eosToNumber(rexPool.total_rent);
  const totalLendable = eosToNumber(rexPool.total_lendable);
  const namebidProceeds = eosToNumber(rexPool.namebid_proceeds);
  
  // Total income to REX holders
  const totalIncome = totalRent + namebidProceeds;
  
  // APR calculation: (annual income / total lendable) * 100
  if (totalLendable > 0) {
    const annualRate = (totalIncome * 365) / totalLendable;
    return annualRate * 100; // Convert to percentage
  }
  
  return 0;
}

const fetchFees = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  
  try {
    const [rexPool, rexReturn, eosPrice] = await Promise.all([
      getREXPool(),
      getREXReturnPool(),
      getEOSPrice()
    ]);
    
    if (!rexPool) {
      throw new Error("Failed to fetch REX pool data");
    }

    if (!rexReturn) {
      throw new Error("Failed to fetch REX return pool data");
    }

    // Extract data from rexpool
    const totalLent = eosToNumber(rexPool.total_lent);
    const totalRent = eosToNumber(rexPool.total_rent);
    const namebidProceeds = eosToNumber(rexPool.namebid_proceeds);
    const totalRex = eosToNumber(rexPool.total_rex);
    const totalLendable = eosToNumber(rexPool.total_lendable);

    // The rexretpool table tracks the rate at which proceeds are added to REX pool
    // dist_interval = 10 minutes (600 seconds)
    // current_rate_of_increase is added every 10 minutes
    // Daily rate = current_rate_of_increase * (24 hours * 6 intervals per hour)
    
    const INTERVALS_PER_DAY = 144; // (24 * 60) / 10 = 144 intervals per day
    const EOS_DECIMALS = 10000; // EOS uses 4 decimal places (10^4)
    
    let dailyFeesEOS = 0;
    
    // Validate current_rate_of_increase exists and is a valid number
    if (rexReturn && rexReturn.current_rate_of_increase) {
      const rateOfIncreaseValue = parseFloat(rexReturn.current_rate_of_increase);
      
      if (rateOfIncreaseValue > 0) {
        // Convert from smallest units to EOS (divide by 10000 for 4 decimals)
        const ratePerInterval = rateOfIncreaseValue / EOS_DECIMALS;
        // Calculate daily fees across all 144 intervals
        dailyFeesEOS = ratePerInterval * INTERVALS_PER_DAY;
      } else {
        console.warn("current_rate_of_increase is zero, no fees flowing into REX");
        dailyFeesEOS = 0;
      }
    } else {
      console.error("rexretpool data missing or current_rate_of_increase unavailable");
      throw new Error("Cannot calculate accurate daily fees without rexretpool.current_rate_of_increase");
    }
    
    // Convert to USD using current EOS price
    const dailyFeesUSD = dailyFeesEOS * eosPrice;
    
    // Revenue distribution
    // 100% of fees flow to REX token holders
    // No burn, no protocol fee - all fees accrue to REX holders proportionally
    const dailyRevenueUSD = dailyFeesUSD;
    const dailyProtocolRevenueUSD = dailyRevenueUSD;
    
    return {
      dailyFees: dailyFeesUSD.toString(),
      dailyRevenue: dailyRevenueUSD.toString(),
      dailyProtocolRevenue: dailyProtocolRevenueUSD.toString(),
    };
  } catch (error) {
    console.error("Error fetching REX data:", error);
    throw error;
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.EOS]: {
      fetch: fetchFees,
      start: 1557964800, // REX launch: May 16, 2019
    },
  },
  methodology: {
    Fees: "CPU/NET rental payments, RAM trading fees (0.5%), and name auction proceeds flowing into REX pool. Calculated from rexretpool.current_rate_of_increase × 144 daily distribution intervals. Converted to USD using current EOS price from CoinGecko.",
    Revenue: "100% of fees distributed to REX token holders proportionally to their holdings. Converted to USD.",
    ProtocolRevenue: "Revenue distributed to REX token holders (same as Revenue, no protocol fee or burn). Converted to USD.",
  },
};

export default adapter;


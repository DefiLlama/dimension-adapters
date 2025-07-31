import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Solana constants
const MANAGER_ADDRESS = 'G6L1NE8tLYYzvMHYHbkHZqPFvfEsiRAsHSvyNQ2hut3o';

// Correct vault addresses from the Python code (not PDAs)
const VAULT_ADDRESSES = [
  "CoHd9JpwfcA76XQGA4AYfnjvAtWKoBQ6eWBkFzR1A2ui", // hJLP 1x (USDC)
  "JCigGWJJRCPas7B9eUe2JgkyqQjGxMKkvZcJ7VQaNBqx", // hJLP 2x (USDC)
  "J6hcyp5rAsb1h7Qwgk763X6e2WnHgZa489VCE5VXgHLT", // Gauntlet Basis Alpha (USDC)
  "AocrjhFd2oxyVccz1vdnZc9Hd9bnW9ejuWWH73PedykU", // hJLP 1x (JLP)
  "4r3HvmEMqWFc5jgwfNQvzDnk7xb8JdhQ6AtcqQVLNXgP", // SOL Plus
  "5LVLbAddNbAiKscWqYV8GHwv6STb3xmqhhc6W5HoHVVg", // cbBTC Plus
  "6aowo7AoE6rw8CS6knd746XiRysuiEjs9YpZyHRAMnor", // dSOL Plus
  "4F7c7v9cZHatcZLy9TZFv1jrRrReACLBxciMkbDqVkfQ", // jitoSOL Plus
  "8ziYC1onrdfq2KhRQamz392Ykx8So48uWzd3f8tXJpVz", // DRIFT Plus
  "5M13RDhVWSGiuUPU3ewnxLWdMjcYx5zCzBLgvMjVuZ2K", // JTO Plus
  "425JLbAYgkQiRfyZLB3jDdibzCFT4SJFfyHHemZMpHpJ"  // Carrot hJLP
];

// Morpho vault addresses
const MORPHO_VAULTS = {
  ethereum: ['0xC684c6587712e5E7BDf9fD64415F23Bd2b05fAec'],
  base: [
    '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0',
    '0xFd144f7A189DBf3c8009F18821028D1CF3EF2428'
  ],
  polygon: ['0xC684c6587712e5E7BDf9fD64415F23Bd2b05fAec']
};

async function calculateGrossReturns(): Promise<number> {
  let totalGrossReturns = 0;

  for (const vaultAddress of VAULT_ADDRESSES) {
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const response = await globalThis.fetch(`https://app.drift.trade/api/vaults/vault-snapshots?vault=${vaultAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && data.length > 0) {
          // Get latest snapshot
          const latest = data[data.length - 1];
          
          // Calculate gross returns based on current value vs net deposits
          // Values are in raw units (e.g., lamports for SOL, smallest USDC unit)
          const currentValueRaw = latest.totalAccountQuoteValue || 0;
          const totalDepositsRaw = latest.totalDeposits || 0;
          const totalWithdrawsRaw = latest.totalWithdraws || 0;
          const managerFeesRaw = latest.managerTotalFee || 0;
          
          // Convert to USDC (6 decimals)
          const currentValue = currentValueRaw / 1000000; // USDC has 6 decimals
          const totalDeposits = totalDepositsRaw / 1000000;
          const totalWithdraws = totalWithdrawsRaw / 1000000;
          const managerFees = managerFeesRaw / 1000000;
          
          const netDeposits = totalDeposits - totalWithdraws;
          
          // Gross PNL = Current Value - Net Deposits
          const grossPNL = Math.max(0, currentValue - netDeposits);
          
          // Total value generated = Gross PNL + Manager Fees
          const totalValueGenerated = grossPNL + managerFees;
          
          totalGrossReturns += totalValueGenerated;
        }
      }
    } catch (error) {
      console.error(`Error calculating returns for vault ${vaultAddress}:`, error);
    }
  }

  console.log(`Total gross returns for depositors: ${totalGrossReturns.toLocaleString()} USDC`);
  return totalGrossReturns;
}

// Solana fetch function
const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const { createBalances } = options;
  // Get manager fees from Dune SQL (using the working query)
  const vaultAddressesList = VAULT_ADDRESSES.map(addr => `'${addr}'`).join(', ');
  
  const managerFeesQuery = `
    SELECT 
      SUM(amount_display) as total_amount,
      token_mint_address,
      symbol
    FROM tokens_solana.transfers 
    WHERE from_owner IN (${vaultAddressesList})
      AND to_owner = '${MANAGER_ADDRESS}'
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY token_mint_address, symbol
    ORDER BY total_amount DESC
  `;

  try {
    const managerFeesData = await queryDuneSql(options, managerFeesQuery);
    console.log('Manager fees from Dune:', managerFeesData);
    
    // Calculate gross returns from Drift API
    const grossReturns = await calculateGrossReturns();
    
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    
    // Add gross returns as fees (total value generated)
    dailyFees.addUSDValue(grossReturns);
    
    // Add manager fees as revenue
    if (managerFeesData && managerFeesData.length > 0) {
      managerFeesData.forEach((fee: any) => {
        if (fee.total_amount && fee.token_mint_address) {
          dailyRevenue.add(fee.token_mint_address, fee.total_amount);
        }
      });
    }
    
    return { 
      dailyFees,      // Total value generated for depositors
      dailyRevenue    // Gauntlet's performance fees
    };
  } catch (error) {
    console.error('Error in Gauntlet adapter:', error);
    
    // Fallback to just gross returns if Dune fails
    const grossReturns = await calculateGrossReturns();
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    
    dailyFees.addUSDValue(grossReturns);
    
    return { 
      dailyFees,      // Total value generated for depositors
      dailyRevenue    // Gauntlet's performance fees (0 if Dune fails)
    };
  }
};

// Morpho vault fetch functions
const fetchMorphoVaults = async (chain: string, _a: any, _b: any, options: FetchOptions) => {
  const { createBalances } = options;
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  
  const vaults = MORPHO_VAULTS[chain as keyof typeof MORPHO_VAULTS] || [];
  
  // TODO: Implement actual Morpho vault tracking
  // For now, return placeholder values
  console.log(`Morpho vaults for ${chain}: ${vaults.join(', ')}`);
  
  return { dailyFees, dailyRevenue };
};

const fetchEthereum = async (_a: any, _b: any, options: FetchOptions) => {
  return fetchMorphoVaults('ethereum', _a, _b, options);
};

const fetchBase = async (_a: any, _b: any, options: FetchOptions) => {
  return fetchMorphoVaults('base', _a, _b, options);
};

const fetchPolygon = async (_a: any, _b: any, options: FetchOptions) => {
  return fetchMorphoVaults('polygon', _a, _b, options);
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    // Original chains (Ethereum, Base, Polygon) - Morpho vaults
    [CHAIN.ETHEREUM]: {
      fetch: fetchEthereum,
      start: '2024-01-01',
      meta: {
        methodology: {
          Fees: "Morpho vault yields (to be implemented)",
          Revenue: "Morpho vault curator fees (to be implemented)"
        }
      }
    },
    [CHAIN.BASE]: {
      fetch: fetchBase,
      start: '2024-01-01',
      meta: {
        methodology: {
          Fees: "Morpho vault yields (to be implemented)",
          Revenue: "Morpho vault curator fees (to be implemented)"
        }
      }
    },
    [CHAIN.POLYGON]: {
      fetch: fetchPolygon,
      start: '2024-01-01',
      meta: {
        methodology: {
          Fees: "Morpho vault yields (to be implemented)",
          Revenue: "Morpho vault curator fees (to be implemented)"
        }
      }
    },
    
    // New Solana chain - Drift vaults (fully implemented)
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-01-01',
      meta: {
        methodology: {
          Fees: "Total value generated for depositors (gross returns from vault operations)",
          Revenue: "Performance fees claimed by the Gauntlet manager from vault operations"
        }
      }
    }
  },
  isExpensiveAdapter: true
};

export default adapter;

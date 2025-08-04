import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CuratorConfig, getCuratorExport } from "../helpers/curators";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// Curator config for EVM chains
const curatorConfig: CuratorConfig = {
  vaults: {
    ethereum: {
      morphoVaultOwners: [
        '0xC684c6587712e5E7BDf9fD64415F23Bd2b05fAec',
      ],
    },
    base: {
      morphoVaultOwners: [
        '0x5a4E19842e09000a582c20A4f524C26Fb48Dd4D0',
        '0xFd144f7A189DBf3c8009F18821028D1CF3EF2428',
      ],
    },
    polygon: {
      morphoVaultOwners: [
        '0xC684c6587712e5E7BDf9fD64415F23Bd2b05fAec',
      ],
    },
  }
};

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

async function calculateGrossReturns(options: FetchOptions): Promise<number> {
  let totalGrossReturns = 0;

  for (const vaultAddress of VAULT_ADDRESSES) {
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const response = await globalThis.fetch(`https://app.drift.trade/api/vaults/vault-snapshots?vault=${vaultAddress}`);
      
      if (response.ok) {
        const data = await response.json();
        
        if (data && Array.isArray(data) && data.length > 0) {
          // Get snapshots for the specified time period (daily calculation)
          const startTime = options.startTimestamp * 1000; // Convert to milliseconds
          const endTime = options.endTimestamp * 1000;
          
          // Sort snapshots by timestamp to ensure correct ordering
          const sortedData = data.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.createdAt || 0).getTime();
            const timeB = new Date(b.timestamp || b.createdAt || 0).getTime();
            return timeA - timeB;
          });
          
          // Find the closest snapshots to start and end times
          let startSnapshot = null;
          let endSnapshot = null;
          
          for (const snapshot of sortedData) {
            const snapshotTime = new Date(snapshot.timestamp || snapshot.createdAt || 0).getTime();
            
            // Find snapshot closest to or before start time
            if (snapshotTime <= startTime) {
              startSnapshot = snapshot;
            }
            
            // Find snapshot closest to or at end time
            if (snapshotTime <= endTime) {
              endSnapshot = snapshot;
            }
          }
          
          // If we don't have a start snapshot, use the first available
          if (!startSnapshot && sortedData.length > 0) {
            startSnapshot = sortedData[0];
          }
          
          // If we don't have an end snapshot, use the last available
          if (!endSnapshot && sortedData.length > 0) {
            endSnapshot = sortedData[sortedData.length - 1];
          }
          
          if (startSnapshot && endSnapshot && startSnapshot !== endSnapshot) {
            // Values are in raw units (e.g., lamports for SOL, smallest USDC unit)
            const startValueRaw = startSnapshot.totalAccountQuoteValue || 0;
            const endValueRaw = endSnapshot.totalAccountQuoteValue || 0;
            const startDepositsRaw = startSnapshot.totalDeposits || 0;
            const endDepositsRaw = endSnapshot.totalDeposits || 0;
            const startWithdrawsRaw = startSnapshot.totalWithdraws || 0;
            const endWithdrawsRaw = endSnapshot.totalWithdraws || 0;
            const startManagerFeesRaw = startSnapshot.managerTotalFee || 0;
            const endManagerFeesRaw = endSnapshot.managerTotalFee || 0;
            
            // Convert to USDC (6 decimals)
            const startValue = startValueRaw / 1000000;
            const endValue = endValueRaw / 1000000;
            const startNetDeposits = (startDepositsRaw - startWithdrawsRaw) / 1000000;
            const endNetDeposits = (endDepositsRaw - endWithdrawsRaw) / 1000000;
            const startManagerFees = startManagerFeesRaw / 1000000;
            const endManagerFees = endManagerFeesRaw / 1000000;
            
            // Calculate daily returns for the specified period INCLUDING LOSSES
            const startNetValue = startValue - startNetDeposits;
            const endNetValue = endValue - endNetDeposits;
            const periodReturns = endNetValue - startNetValue;
            const periodManagerFees = endManagerFees - startManagerFees;
            
            // Total value generated during this period = Period returns + Period manager fees
            // This can be negative if there are losses, which is correct
            const periodValueGenerated = periodReturns + periodManagerFees;
            
            totalGrossReturns += periodValueGenerated;
          }
        }
      }
    } catch (error) {
      console.error(`Error calculating returns for vault ${vaultAddress}:`, error);
    }
  }

  console.log(`Daily gross returns for depositors (including losses): ${totalGrossReturns.toLocaleString()} USDC`);
  return totalGrossReturns;
}

// Solana fetch function
const fetchSolana = async (options: FetchOptions) => {
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
    const grossReturns = await calculateGrossReturns(options);
    
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
      dailyFees,      // Daily value generated for depositors during specified period (including losses)
      dailyRevenue    // Gauntlet's daily performance fees during specified period
    };
  } catch (error) {
    console.error('Error in Gauntlet adapter:', error);
    
    // Fallback to just gross returns if Dune fails
    const grossReturns = await calculateGrossReturns(options);
    const dailyFees = createBalances();
    const dailyRevenue = createBalances();
    
    dailyFees.addUSDValue(grossReturns);
    
    return { 
      dailyFees,      // Daily value generated for depositors during specified period (including losses)
      dailyRevenue    // Gauntlet's daily performance fees (0 if Dune fails)
    };
  }
};

// Get curator export for EVM chains and combine with Solana
const curatorExport = getCuratorExport(curatorConfig);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...curatorExport,
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-01-01',
      meta: {
        methodology: {
          Fees: "Daily value generated for depositors from vault operations during the specified time period (includes both gains and losses)",
          Revenue: "Daily performance fees claimed by the Gauntlet manager during the specified time period"
        }
      }
    }
  },
  isExpensiveAdapter: true
};

export default adapter;

import { SimpleAdapter, ChainBlocks, FetchOptions } from "../adapters/types";

// Constants
// Note: HELIUS_API_KEY environment variable must be set for this adapter to work
// DeFiLlama infrastructure should provide this API key
const MANAGER_ADDRESS = 'G6L1NE8tLYYzvMHYHbkHZqPFvfEsiRAsHSvyNQ2hut3o';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY;

// Correct vault addresses from the Python code (not PDAs)
const VAULT_CONFIGS = [
  { name: "hJLP 1x (USDC)", address: "CoHd9JpwfcA76XQGA4AYfnjvAtWKoBQ6eWBkFzR1A2ui" },
  { name: "hJLP 2x (USDC)", address: "JCigGWJJRCPas7B9eUe2JgkyqQjGxMKkvZcJ7VQaNBqx" },
  { name: "Gauntlet Basis Alpha (USDC)", address: "J6hcyp5rAsb1h7Qwgk763X6e2WnHgZa489VCE5VXgHLT" },
  { name: "hJLP 1x (JLP)", address: "AocrjhFd2oxyVccz1vdnZc9Hd9bnW9ejuWWH73PedykU" },
  { name: "SOL Plus", address: "4r3HvmEMqWFc5jgwfNQvzDnk7xb8JdhQ6AtcqQVLNXgP" },
  { name: "cbBTC Plus", address: "5LVLbAddNbAiKscWqYV8GHwv6STb3xmqhhc6W5HoHVVg" },
  { name: "dSOL Plus", address: "6aowo7AoE6rw8CS6knd746XiRysuiEjs9YpZyHRAMnor" },
  { name: "jitoSOL Plus", address: "4F7c7v9cZHatcZLy9TZFv1jrRrReACLBxciMkbDqVkfQ" },
  { name: "DRIFT Plus", address: "8ziYC1onrdfq2KhRQamz392Ykx8So48uWzd3f8tXJpVz" },
  { name: "JTO Plus", address: "5M13RDhVWSGiuUPU3ewnxLWdMjcYx5zCzBLgvMjVuZ2K" },
  { name: "Carrot hJLP", address: "425JLbAYgkQiRfyZLB3jDdibzCFT4SJFfyHHemZMpHpJ" }
];

interface Transaction {
  signature: string;
  timestamp: number;
  fee: number;
  slot: number;
  type: string;
  source: string;
  tokenTransfers: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  accountData: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      mint: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      uiTokenAmount: {
        amount: string;
        decimals: number;
        uiAmount: number;
        uiAmountString: string;
      };
    }>;
  }>;
  instructions: Array<{
    accounts: string[];
    data: string;
    programId: string;
  }>;
}

async function fetchAllTransactions(address: string, _startTime: number): Promise<Transaction[]> {
  if (!HELIUS_API_KEY) {
    throw new Error('HELIUS_API_KEY environment variable is required');
  }

  const allTransactions: Transaction[] = [];
  let before: string | undefined;

  while (true) {
    try {
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions`;
      const params = new URLSearchParams({
        'api-key': HELIUS_API_KEY,
        'limit': '100'
      });
      if (before) params.append('before', before);

      const response = await globalThis.fetch(`${url}?${params.toString()}`);
      if (!response.ok) {
        console.error(`Error fetching batch: ${response.status} ${response.statusText}`);
        break;
      }

      const transactions: Transaction[] = await response.json();
      if (transactions.length === 0) break;

      allTransactions.push(...transactions);
      before = transactions[transactions.length - 1].signature;

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Error fetching batch: ${error}`);
      break;
    }
  }

  return allTransactions;
}

async function calculateManagerFees(): Promise<Record<string, number>> {
  const feesByToken: Record<string, number> = {};
  let totalTransfers = 0;

  try {
    // Fetch manager transactions with pagination
    const allTransactions = await fetchAllTransactions(MANAGER_ADDRESS, 1704067200); // 2024-01-01

    for (const tx of allTransactions) {
      // Check for token transfers TO the manager (these are the fees)
      if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
        for (const transfer of tx.tokenTransfers) {
          // Check if this is a transfer TO the manager
          if (transfer.toUserAccount === MANAGER_ADDRESS) {
            const mint = transfer.mint;
            const amount = transfer.tokenAmount;
            
            // This is a fee transfer to the manager
            if (!feesByToken[mint]) feesByToken[mint] = 0;
            feesByToken[mint] += amount;
            totalTransfers++;
          }
        }
      }
    }

    console.log(`Found ${totalTransfers} fee transfers to manager`);
  } catch (error) {
    console.error('Error calculating manager fees:', error);
  }
  
  return feesByToken;
}

async function calculateGrossReturns(): Promise<Record<string, number>> {
  const returnsByToken: Record<string, number> = {};
  let totalGrossReturns = 0;

  for (const vault of VAULT_CONFIGS) {
    try {
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const response = await globalThis.fetch(`https://app.drift.trade/api/vaults/vault-snapshots?vault=${vault.address}`);
      
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
      console.error(`Error calculating returns for ${vault.name}:`, error);
    }
  }

  // All returns are in USDC
  returnsByToken['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'] = totalGrossReturns;
  
  console.log(`Total gross returns for depositors: ${totalGrossReturns.toLocaleString()} USDC`);
  return returnsByToken;
}

const fetch = async (options: FetchOptions) => {
  try {
    const managerFees = await calculateManagerFees();
    const totalValueGenerated = await calculateGrossReturns();

    // Create balances objects for proper type compatibility
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    // Add the values to the balances
    Object.entries(totalValueGenerated).forEach(([key, value]) => {
      if (!isNaN(Number(value)) && Number(value) > 0) {
        dailyFees.add(key, Number(value));
      }
    });

    Object.entries(managerFees).forEach(([key, value]) => {
      if (!isNaN(Number(value)) && Number(value) > 0) {
        dailyRevenue.add(key, Number(value));
      }
    });

    return {
      dailyFees,      // Total value generated for depositors
      dailyRevenue    // Gauntlet's performance fees
    };
  } catch (error) {
    console.error('Error in Gauntlet adapter:', error);
    // Return empty results if there's an error (e.g., missing API key)
    return {
      dailyFees: options.createBalances(),
      dailyRevenue: options.createBalances()
    };
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    solana: {
      fetch,
      start: 1704067200, // 2024-01-01
      meta: {
        methodology: {
          Fees: "Total value generated for depositors (gross returns from vault operations)",
          Revenue: "Performance fees claimed by the Gauntlet manager from vault operations"
        }
      }
    }
  }
};

export default adapter;

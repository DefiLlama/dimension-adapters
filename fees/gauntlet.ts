import { SimpleAdapter } from "../adapters/types";

/**
 * Gauntlet Solana Vault Fee Tracking Adapter
 * 
 * SETUP INSTRUCTIONS:
 * 1. Create a .env file in the root directory
 * 2. Add your Helius API key: HELIUS_API_KEY=your_actual_key_here
 * 3. Get your API key from: https://www.helius.dev/
 * 
 * The .env file is already in .gitignore, so your API key won't be committed.
 */

// Constants
const MANAGER_ADDRESS = 'G6L1NE8tLYYzvMHYHbkHZqPFvfEsiRAsHSvyNQ2hut3o';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || 'YOUR_HELIUS_API_KEY'; // Use environment variable

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

// Vault addresses (used for context, but actual fee logic now relies on transfers TO manager)
const VAULT_ADDRESSES = [
  'Fu8AWYqw7bPZJAxumXJHs62BQZTMcsUkgGdwoh4v3js2', // hJLP 1x (USDC)
  '3fFkCDe3DU3qVK8FD5fBYumK1bjGKA7uTvVPP53j3ydA', // hJLP 2x (USDC)
  'DMbboHpxpJjTic3CMVRCiJFYKaEEz6izMgE9vB6GBSxv', // Gauntlet Basis Alpha (USDC)
  '7Lka2kKagwTvTWNas2UtPaFiwpgs7r9BJtUEzQBB4DxT', // hJLP 1x (JLP)
  '4UF8DgbH8hGmtfFhV369bkwMyRJbJDGN3UtYCZoeKqN3', // SOL Plus
  '3u3biLVaLsbeQaXKq3Dt7c4di5Un2rqza4QXnFRmVZ7t', // cbBTC Plus
  'EC2w198qubUWA2Xf73hz2d7vFKNaQc1XN7SYYqXbfLKQ', // dSOL Plus
  '4Kayz1HkWJiEcYQgyQkXDC8Y6CeCoV5MYFXg3KwaL9ii', // jitoSOL Plus
  '68oTjvenFJfrr2iYPtBTRiFyXA8N2pXdHDP82YvuhLaC', // DRIFT Plus
  'GYxrPXFhCQamBxUc4wMYHnB235Aei7GZsjFCfZgfYJ6b', // Carrot hJLP
  'FbbcWcg5FfiPdBhkxuBAAL' // JTO Plus
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

async function fetchAllTransactions(address: string, startTime: number): Promise<Transaction[]> {
  const allTransactions: Transaction[] = [];
  let before: string | undefined;

  while (true) {
    try {
      const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_API_KEY}`;
      const params = new URLSearchParams({
        'until': startTime.toString(),
        'limit': '1000'
      });
      if (before) params.append('before', before);

      const response = await globalThis.fetch(`${url}&${params.toString()}`);
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

async function calculateVaultFees(): Promise<Record<string, number>> {
  const feesByToken: Record<string, number> = {};
  let totalTransfers = 0;

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



const fetch = async (timestamp: number) => {
  try {
    const managerFees = await calculateManagerFees();
    const totalValueGenerated = await calculateGrossReturns();

    // Ensure we return valid numbers, not NaN
    const fees = Object.fromEntries(
      Object.entries(totalValueGenerated).map(([key, value]) => [key, isNaN(value) ? 0 : value])
    );
    
    const revenue = Object.fromEntries(
      Object.entries(managerFees).map(([key, value]) => [key, isNaN(value) ? 0 : value])
    );

    return {
      dailyFees: fees,      // Total value generated for depositors
      dailyRevenue: revenue // Gauntlet performance fees
    };
  } catch (error) {
    console.error("Error in Gauntlet adapter:", error);
    // Return empty results if there is an error (e.g., missing API key)
    return {
      dailyFees: {},
      dailyRevenue: {}
    };
  }
const adapter: SimpleAdapter = {
  adapter: {
    solana: {
      fetch,
      start: 1704067200, // 2024-01-01
      meta: {
        methodology: {
          Fees: "Realized fees from Gauntlet vault operations that have been claimed by the manager",
          Revenue: "Revenue retained by the Gauntlet protocol from vault operations"
        }
      }
    }
    }
  }
};

export default adapter;

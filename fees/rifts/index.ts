import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { extractPubkey, getProgramAccounts } from "../../helpers/solana";

// Rifts Protocol - SPL Token-2022 Wrapping Protocol with Transfer Fees
// Tracks wrap/unwrap fees and Token-2022 transfer fees collected across all Rifts

const V2_PROGRAM = '29JgMGWZ28CSF7JLStKFp8xb4BZyf7QitG5CHcfRBYoR';
const V1_PROGRAM = '9qomJJ5jMzaKu9JXgMzbA3KEyQ3kqcW7hN3xq3tMEkww';

// Rift account offsets: fees_vault (168), withheld_vault (200)
const FEES_VAULT_OFFSET = 168;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

// Base58 validation regex for Solana addresses
const BASE58_REGEX = /^[1-9A-HJ-NP-Za-km-z]+$/;

/**
 * Validates if a string is a valid Base58-encoded Solana address.
 * 
 * Checks that the address:
 * - Is a string type
 * - Has length between 32 and 44 characters (typical Solana address range)
 * - Contains only valid Base58 characters (excludes 0, O, I, l to avoid confusion)
 * 
 * @param address - The address string to validate
 * @returns True if the address is valid, false otherwise
 */
function isValidBase58Address(address: string): boolean {
  return typeof address === 'string' && 
         address.length >= 32 && 
         address.length <= 44 && 
         BASE58_REGEX.test(address);
}

/**
 * Discovers fee vault addresses from on-chain Rift program accounts.
 * 
 * Queries both V1 and V2 Rift programs to find all Rift accounts, then extracts
 * the fees_vault and withheld_vault addresses from each account's data.
 * Only non-system-program vaults are included in the result.
 * 
 * @returns Array of unique vault addresses (Base58-encoded Solana addresses)
 */
async function discoverVaultAddresses(): Promise<string[]> {
  const vaults = new Set<string>();

  for (const programId of [V2_PROGRAM, V1_PROGRAM]) {
    try {
      const accounts = await getProgramAccounts({
        programId,
        encoding: "base64",
        dataSlice: { offset: FEES_VAULT_OFFSET, length: 64 },
        filters: [{ dataSize: 782 }],
      });

      for (const acc of accounts) {
        const data = acc.account.data[0];
        if (Buffer.from(data, 'base64').length < 64) continue;
        const feesVault = extractPubkey(data, 0);
        const withheldVault = extractPubkey(data, 32);
        if (feesVault !== SYSTEM_PROGRAM) vaults.add(feesVault);
        if (withheldVault !== SYSTEM_PROGRAM) vaults.add(withheldVault);
      }
    } catch (error: any) {
      // Log error with context but continue to next programId
      console.error(
        `Failed to discover vault addresses for program ${programId}:`,
        error?.message || error?.toString() || error,
      );
    }
  }

  return Array.from(vaults);
}

/**
 * Fetches daily fees, revenue, and volume data for the Rifts Protocol.
 * 
 * Discovers vault addresses dynamically from on-chain Rift accounts, then queries
 * Dune Analytics to aggregate:
 * - Fees: Wrap/unwrap fees and Token-2022 transfer fees collected in vaults
 * - Revenue: All collected fees (same as fees)
 * - Protocol Revenue: All collected fees (same as fees)
 * - Volume: USD value of token transfers in wrap/unwrap operations
 * 
 * @param _a - Unused adapter parameter (kept for compatibility)
 * @param _b - Unused adapter parameter (kept for compatibility)
 * @param options - Fetch options containing time range and Dune query utilities
 * @returns Object containing dailyFees, dailyRevenue, dailyProtocolRevenue, and dailyVolume
 */
const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const vaultAddresses = await discoverVaultAddresses();
  
  // Validate and sanitize vault addresses (Base58 format, 32-44 chars)
  const validatedVaultAddresses = vaultAddresses.filter(isValidBase58Address);
  if (validatedVaultAddresses.length === 0) {
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyVolume: 0 };
  }

  // Validate program IDs (should always be valid, but validate for safety)
  const programs = [V2_PROGRAM, V1_PROGRAM].filter(isValidBase58Address);
  if (programs.length === 0) {
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyVolume: 0 };
  }

  const programList = programs.map(p => `'${p}'`).join(', ');
  const vaultValues = validatedVaultAddresses.map(v => `('${v}')`).join(', ');

  const query = `
    WITH vault_addrs AS (
      SELECT address FROM (VALUES ${vaultValues}) AS t(address)
    ),
    rifts_txns AS (
      SELECT DISTINCT tx_id
      FROM solana.instruction_calls
      WHERE (executing_account IN (${programList})
        OR inner_executing_account IN (${programList}))
        AND tx_success = true
        AND TIME_RANGE
    ),
    fee_transfers AS (
      SELECT
        token_mint_address AS mint,
        SUM(amount) AS amount
      FROM tokens_solana.transfers
      WHERE to_token_account IN (SELECT address FROM vault_addrs)
        AND tx_id IN (SELECT tx_id FROM rifts_txns)
        AND TIME_RANGE
      GROUP BY token_mint_address
    )
    SELECT mint, amount AS fee_amount, NULL AS daily_volume FROM fee_transfers
  `;

  const results = await queryDuneSql(options, query);

  for (const row of results) {
    dailyFees.add(row.mint, row.fee_amount);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Total fees collected across all Rifts, including wrap fees, unwrap fees (in underlying tokens), and Token-2022 transfer fees (withheld in rift tokens). Vault addresses are discovered dynamically from on-chain Rift accounts.",
  Revenue: "All collected fees constitute protocol revenue, distributed to treasury and partners.",
  ProtocolRevenue: "All collected fees go to the protocol treasury and optional partner wallets.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-07-01',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
};

export default adapter;

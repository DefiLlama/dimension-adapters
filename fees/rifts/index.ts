import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { httpPost } from "../../utils/fetchURL";
import { getEnv } from "../../helpers/env";
import { encodeBase58 } from "ethers";

// Rifts Protocol - SPL Token-2022 Wrapping Protocol with Transfer Fees
// Tracks wrap/unwrap fees and Token-2022 transfer fees collected across all Rifts

const V2_PROGRAM = '29JgMGWZ28CSF7JLStKFp8xb4BZyf7QitG5CHcfRBYoR';
const V1_PROGRAM = '9qomJJ5jMzaKu9JXgMzbA3KEyQ3kqcW7hN3xq3tMEkww';

// Rift account offsets: fees_vault (168), withheld_vault (200)
const FEES_VAULT_OFFSET = 168;
const WITHHELD_VAULT_OFFSET = 200;
const SYSTEM_PROGRAM = '11111111111111111111111111111111';

function extractPubkey(base64Data: string, offset: number): string {
  const buffer = Buffer.from(base64Data, 'base64');
  const pubkeyBytes = new Uint8Array(buffer.slice(offset, offset + 32));
  return encodeBase58(pubkeyBytes);
}

async function discoverVaultAddresses(): Promise<string[]> {
  const vaults = new Set<string>();

  for (const programId of [V2_PROGRAM, V1_PROGRAM]) {
    try {
      const response = await httpPost(getEnv("SOLANA_RPC"), {
        jsonrpc: "2.0",
        id: 1,
        method: "getProgramAccounts",
        params: [
          programId,
          {
            encoding: "base64",
            dataSlice: { offset: FEES_VAULT_OFFSET, length: 64 },
            filters: [{ dataSize: 782 }]
          }
        ]
      });

      const accounts = response?.result || [];
      for (const acc of accounts) {
        const data = acc.account.data[0];
        if (Buffer.from(data, 'base64').length < 64) continue;
        const feesVault = extractPubkey(data, 0);
        const withheldVault = extractPubkey(data, 32);
        if (feesVault !== SYSTEM_PROGRAM) vaults.add(feesVault);
        if (withheldVault !== SYSTEM_PROGRAM) vaults.add(withheldVault);
      }
    } catch (_e) {
      // Continue if one program fails
    }
  }

  return Array.from(vaults);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const vaultAddresses = await discoverVaultAddresses();
  if (vaultAddresses.length === 0) {
    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, dailyVolume: 0 };
  }

  const programList = [V2_PROGRAM, V1_PROGRAM].map(p => `'${p}'`).join(', ');
  const vaultValues = vaultAddresses.map(v => `('${v}')`).join(', ');

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
    ),
    volume AS (
      SELECT COALESCE(SUM(amount_usd), 0) AS daily_volume
      FROM tokens_solana.transfers
      WHERE tx_id IN (SELECT tx_id FROM rifts_txns)
        AND TIME_RANGE
    )
    SELECT 'volume' AS row_type, NULL AS mint, NULL AS fee_amount, daily_volume FROM volume
    UNION ALL
    SELECT 'fee' AS row_type, mint, amount AS fee_amount, NULL AS daily_volume FROM fee_transfers
  `;

  const results = await queryDuneSql(options, query);

  let dailyVolume = 0;
  for (const row of results) {
    if (row.row_type === 'volume') {
      dailyVolume = Number(row.daily_volume) || 0;
    } else if (row.row_type === 'fee') {
      dailyFees.add(row.mint, row.fee_amount);
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyVolume,
  };
};

const methodology = {
  Fees: "Total fees collected across all Rifts, including wrap fees, unwrap fees (in underlying tokens), and Token-2022 transfer fees (withheld in rift tokens). Vault addresses are discovered dynamically from on-chain Rift accounts.",
  Revenue: "All collected fees constitute protocol revenue, distributed to treasury and partners.",
  ProtocolRevenue: "All collected fees go to the protocol treasury and optional partner wallets.",
  Volume: "Total USD value of token transfers in wrap/unwrap operations across all Rifts.",
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

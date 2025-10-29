import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import fetchURL from "../../utils/fetchURL";

const PROGRAM_ID = 'exomt54Csh4fvkUiyV5h6bjNqxDqLdpgHJmLd4eqynk';
const VAULT_SNAPSHOT_URL = "https://raw.githubusercontent.com/DefiLlama/DefiLlama-Adapters/master/projects/exotic-markets/vaults.json";

let cachedVaultAccountsPromise: Promise<string[]> | undefined;

async function getVaultTokenAccounts(): Promise<string[]> {
  if (!cachedVaultAccountsPromise) {
    cachedVaultAccountsPromise = fetchURL(VAULT_SNAPSHOT_URL)
      .then((data: any) => Array.isArray(data?.tokenAccounts) ? data.tokenAccounts : [])
      .catch(() => []);
  }
  return cachedVaultAccountsPromise;
}
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();

  const vaultTokenAccounts = await getVaultTokenAccounts();
  if (!vaultTokenAccounts.length)
    return { dailyNotionalVolume, dailyPremiumVolume };

  const vaultAddressList = vaultTokenAccounts
    .map((address) => `'${address}'`)
    .join(",\n        ");

  const volumeQuery = `
    WITH exotic_txs AS (
      SELECT DISTINCT
        tx_id
      FROM solana.instruction_calls
      WHERE executing_account = '${PROGRAM_ID}'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time <= from_unixtime(${options.endTimestamp})
        AND tx_success = true
    ),
    premium_transfers AS (
      SELECT 
        t.token_mint_address,
        SUM(t.amount) AS premium_amount
      FROM tokens_solana.transfers t
      INNER JOIN exotic_txs e ON t.tx_id = e.tx_id
      WHERE t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <= from_unixtime(${options.endTimestamp})
        AND t.token_mint_address IS NOT NULL
        AND t.amount > 0
        AND t.to_token_account IN (
        ${vaultAddressList}
        )
        AND t.from_token_account NOT IN (
        ${vaultAddressList}
        )
      GROUP BY t.token_mint_address
    ),
    notional_transfers AS (
      SELECT 
        t.token_mint_address,
        SUM(t.amount) AS notional_amount
      FROM tokens_solana.transfers t
      INNER JOIN exotic_txs e ON t.tx_id = e.tx_id
      WHERE t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time <= from_unixtime(${options.endTimestamp})
        AND t.token_mint_address IS NOT NULL
        AND t.amount > 0
        AND t.from_token_account IN (
        ${vaultAddressList}
        )
        AND t.to_token_account NOT IN (
        ${vaultAddressList}
        )
      GROUP BY t.token_mint_address
    )
    SELECT 
      COALESCE(p.token_mint_address, n.token_mint_address) AS token_mint_address,
      COALESCE(p.premium_amount, 0) AS premium_amount,
      COALESCE(n.notional_amount, 0) AS notional_amount
    FROM premium_transfers p
    FULL OUTER JOIN notional_transfers n ON p.token_mint_address = n.token_mint_address
  `;

  const volumeResults = await queryDuneSql(options, volumeQuery);
  
  for (const row of volumeResults) {
    const mint = row.token_mint_address;
    if (!mint) continue;

    const premiumAmount = row.premium_amount ?? '0';
    const notionalAmount = row.notional_amount ?? '0';

    if (premiumAmount !== '0') dailyPremiumVolume.add(mint, premiumAmount);
    if (notionalAmount !== '0') dailyNotionalVolume.add(mint, notionalAmount);
  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2024-01-01',
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    PremiumVolume: "Sum of token inflows from external accounts into the Exotic Markets vault token accounts listed in vaults.json; these correspond to option premiums paid",
    NotionalVolume: "Sum of token outflows from the same vault accounts to external addresses; these represent the notional value settled or traded",
  },
};

export default adapter;

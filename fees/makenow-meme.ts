import ADDRESSES from '../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"

// https://solscan.io/account/8tA49tvPiTCkeVfuTms1F2nwVg6FWpQsQ8eNZ4g9vVQF

// https://solscan.io/account/AEBoqzQU3fDYzhVmaRedcNeVcQQSMEqCAuQ2A7pYNEd7


const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const targets = [
    // Swap fee receivers
    '8tA49tvPiTCkeVfuTms1F2nwVg6FWpQsQ8eNZ4g9vVQF',
    'AEBoqzQU3fDYzhVmaRedcNeVcQQSMEqCAuQ2A7pYNEd7',
    '4KRS8BPCgDZHBTXkugCHuh2ZsZQhmAbdx6ASjMQYNdXd',
    'CJFY81Zom7BpZ66xieAHk3hW43Jru9KmgCBe1eKnWUMi',

    // Token transfer fee receivers
    '76Mk7UH3nSjJXKLi7CVaKurUSywo6xXqhu1k1tJMFUSi',
    '2ViaoccYRm7gRewuPyW4Rp5WvxVJzNoKxxAMBUiii4rp'
  ]

  const blacklists = [
    // Blacklist the old transfer fee receiver to prevent
    // wallet change tx from being counted
    // (5R48wJazTurDMHjERWW3ZTQ6nMdXegD6QH3sE5FsV89UjRCHbBN4n3Pt8y4ngTxi5P5CCt5jx83mRbG6GaPw9rY3)
    '8tA49tvPiTCkeVfuTms1F2nwVg6FWpQsQ8eNZ4g9vVQF',
    'AEBoqzQU3fDYzhVmaRedcNeVcQQSMEqCAuQ2A7pYNEd7',
    '4KRS8BPCgDZHBTXkugCHuh2ZsZQhmAbdx6ASjMQYNdXd',
    'CJFY81Zom7BpZ66xieAHk3hW43Jru9KmgCBe1eKnWUMi',
    '76Mk7UH3nSjJXKLi7CVaKurUSywo6xXqhu1k1tJMFUSi',
    '2ViaoccYRm7gRewuPyW4Rp5WvxVJzNoKxxAMBUiii4rp',
    'u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w'
  ]
  const blacklist_txn_ids = [
    'yNic4CejTw3UVqqpuxgva2Jo238F9WHj1W3ZBH9ExGM2gZQnK9nmcnN2xYe7gjD2YDdCZS7vLA34V1JoYd9ewgL',
    '5R48wJazTurDMHjERWW3ZTQ6nMdXegD6QH3sE5FsV89UjRCHbBN4n3Pt8y4ngTxi5P5CCt5jx83mRbG6GaPw9rY3'
  ]

  // Format addresses for IN clause
  const formattedAddresses = targets.map(addr => `'${addr}'`).join(', ');
  const formattedBlacklist = blacklists.map(addr => `'${addr}'`).join(', ');
  const formattedBlacklistTxnIds = blacklist_txn_ids.map(id => `'${id}'`).join(', ');

  // Convert Allium query to Dune query
  const query = `
    SELECT 
      token_mint_address as mint,
      SUM(amount) as total_amount
    FROM tokens_solana.transfers
    WHERE (
      (to_owner IN (${formattedAddresses})) OR
      (to_owner IS NULL AND token_mint_address = '${ADDRESSES.solana.SOL}' AND tx_signer IN (${formattedAddresses}))
    )
      AND from_owner NOT IN (${formattedBlacklist})
      AND tx_id NOT IN (${formattedBlacklistTxnIds})
      AND TIME_RANGE
    GROUP BY 1
  `;

  const res = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  for (const row of res) {
    dailyFees.add(row.mint, row.total_amount);
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees, }
}

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-09-14',
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Tokens trading and launching fees paid by users.",
    Revenue: "All fees are revenue.",
    ProtocolRevenue: "All revenue collected by protocol.",
  }
}

export default adapters

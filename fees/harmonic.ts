import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { queryDuneSql } from "../helpers/dune"
import { METRIC } from "../helpers/metrics"
import { JitoTipPaymentAddresses } from "./jito-mev-tips"

// validators run Solanace validator nodes using harmonic software
// these validators get share of MEV from Jito MEV tip router
// we count all these MEV share as fees
// Harmonic keeps zero fees share for now

// these addresses are Harmonic Agave validators
// found from here https://dune.com/queries/6791690
const targets = [
  '2m1A2WM1vte7RWz5xTTw4i1SiXmngVtXhqFERaUjoAAb',
  '7ZjHeeYEesmBs4N6aDvCQimKdtJX2bs5boXpJmpG2bZJ',
  '7tqeaFKsg2K9xKnQWe61w71AtCZVMQvG4hbFAiFAngYw',
  '9iFPQbP1jGkj67sXg6YLLGRUBVEDMcapdS6jmCZSnz8R',
  'A1vqhA2fS6K7CvHsJKX1ACcHJFEmyRg4KuR5pctHANy4',
  'AEAJtnjjB19XFreJH21UP8rfd12f9kxMmngwZG3tGXbP',
  'AMukCLCr52XxsEjXoDxKKxjNg4FpnsReXNaQx8aR6DJF',
  'AvNsK6uxBBwejyPe7tZqgX4onaCnXTqKQvKRaTe9Ekya',
  'CAo1dCGYrB6NhHh5xb1cGjUiu86iyCfMTENxgHumSve4',
  'EkvdKhULbMFqjKBKotAzGi3kwMvMpYNDKJXXQQmi6C1f',
  'Hz5aLvpKScNWoe9YZWxBLrQA3qzHJivBGtfciMekk8m5',
  'J6etcxDdYjPHrtyvDXrbCkx3q9W1UjMj1vy1jBFPJEbK',
  'aXiomFkk6VzXaBhPuhMqTLZZguCFzzbyP9LTtZ7ZHLQ',
  'anatWca4MKScN6y6zo5GEoao5ABy1BLHYLz5s2DnjZA',
  'gangtCrQg5RmKf5yxvhvZThPugPX58pDSdQ5UuS26vN',
  'mrgn28BhocwdAUEenen3Sw2MR9cPKDpLkDvzDdR7DBD',
  'mrgn4sJJu5GBa5wbKyjuASzhyCifvcedGoLtpKjB3Wf',
  'nymsHergYedT9CJMgtGMvqXUTGcbs5o3MiWTJUbqTGY',
  'pSoLoZx55zZz61gjxSTwHtwTg4yTwdm7ruBmyjbYgT2',
  'sTepQGoReJq2tBKStL19DT6nnGHcGiAvFjyYaokLyuM',
  '5ZqveVffQPiUbkjBg4KD9kib1MKHLqiFno4ke9jSq9qk',
  '9W3QTgBhkU4Bwg6cwnDJo6eGZ9BtZafSdu1Lo9JmWws7',
  'BtsmiEEvnSuUnKxqXj2PZRYpPJAc7C34mGz8gtJ1DAaH',
  'CW9C7HBwAMgqNdXkNgFg9Ujr3edR2Ab9ymEuQnVacd1A',
  'FBKFWadXZJahGtFitAsBvbqh5968gLY7dMBBJUoUjeNi',
  'FNKgX9dYUhYQFRTM9bkeKoRpsyEtZGNMxbdQLDzfqB8a',
  'XkCriyrNwS3G4rzAXtG5B1nnvb5Ka1JtCku93VqeKAr',
  'oPaLtitM6cwpFVzP2rDhLsJLdY2vcbuZiJJyD1TFUKs',
]

const toAccountList = (accounts: Array<string>) => {
  return accounts.map(account => `'${account}'`).toString();
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await queryDuneSql(
    options,
    `
      SELECT                                                                                                                                                                                                                                                                                                                                                                     
        aa.address,
        SUM(ABS(aa.balance_change)) as amount_sol
      FROM solana.account_activity aa
      INNER JOIN solana.transactions t
        ON aa.tx_id = t.id
      WHERE
        t.signer IN (${toAccountList(targets)})
        AND t.block_time >= FROM_UNIXTIME(${options.fromTimestamp})
        AND t.block_time < FROM_UNIXTIME(${options.toTimestamp})
        AND aa.block_time >= FROM_UNIXTIME(${options.fromTimestamp})
        AND aa.block_time < FROM_UNIXTIME(${options.toTimestamp})
        AND aa.token_mint_address IS NULL
        AND aa.address IN (${toAccountList(JitoTipPaymentAddresses)})
      GROUP BY aa.address
    `
  )
  
  const dailyFees = options.createBalances()
  for (const item of data) {
    dailyFees.add('So11111111111111111111111111111111111111112', item.amount_sol, METRIC.MEV_REWARDS)
  }
  
  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0, // no revenue
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-01-01',
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'Count all MEV rewards to validators running Harmonic Agave node software.',
    Revenue: 'No revenue share to Harmonic.',
    SupplySideRevenue: 'All rewards are distributed to searchers/builders/validators.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MEV_REWARDS]: 'Count all MEV rewards to validators running Harmonic Agave node software',
    },
    Revenue: {
      [METRIC.MEV_REWARDS]: 'No revenue share to Harmonic.',
    },
    SupplySideRevenue: {
      [METRIC.MEV_REWARDS]: 'All rewards are distributed to searchers/builders/validators.',
    },
  },
}

export default adapter

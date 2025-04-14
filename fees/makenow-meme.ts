import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"

// https://solscan.io/account/8tA49tvPiTCkeVfuTms1F2nwVg6FWpQsQ8eNZ4g9vVQF

// https://solscan.io/account/AEBoqzQU3fDYzhVmaRedcNeVcQQSMEqCAuQ2A7pYNEd7


const fetchFees = async (options: FetchOptions) => {
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
    '76Mk7UH3nSjJXKLi7CVaKurUSywo6xXqhu1k1tJMFUSi'
  ]
  const dailyFees = await getSolanaReceived({ options, targets: targets })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: '2022-09-14',
    }
  }
}

export default adapters

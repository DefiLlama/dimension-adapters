import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import { FetchV2 } from "../../adapters/types";

type THeader = {
  [s: string]: string;
}
const headers: THeader = {
  'origin': 'https://polter.finance/',
  'referer': 'https://polter.finance/',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

const RECORDS_PER_PAGE = 1000
const endpoints: any = {
  [CHAIN.FANTOM]: "https://api.studio.thegraph.com/query/71811/polter/version/latest",
};


type RewardsPaid = {
  id: number
  reward: BigInt
  rewardsToken: string
  blockTimestamp: number
}

const fetch: FetchV2 = async ({ chain, startTimestamp, endTimestamp, createBalances }) => {
  let skip = 0
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const rewardsPaids: RewardsPaid[] = []
  while (true) {
    const graphQuery = gql
    `{
        rewardPaids(
          first: ${RECORDS_PER_PAGE},
          skip: ${skip}
          where: { blockTimestamp_lte: ${endTimestamp}, blockTimestamp_gte: ${startTimestamp} },
          orderBy: blockTimestamp
          order: ASC
        ) {
          id
          reward
          rewardsToken
          blockTimestamp
        }
    }`

    const graphRes = await request(endpoints[chain], graphQuery, {}, headers);
    const rewardsPaid = graphRes.rewardPaids
    if (rewardsPaid.length == 0) {
      break
    }
    skip += RECORDS_PER_PAGE
    rewardsPaids.push(...rewardsPaid)
  }
  rewardsPaids.forEach((reward: RewardsPaid) => {
    dailyFees.add(reward.rewardsToken, reward.reward)
    dailyRevenue.add(reward.rewardsToken, reward.reward)
  })
  return {
    dailyFees,
    dailyRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: fetch,
      start: 1706546953 // Jan-29-2024 04:49:13 PM +UTC
    },
  },
}

export default adapter;

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpPost } from "../../utils/fetchURL";

const historicalVolumeEndpoint = "https://api.paycashswap.com/"
const requestBody = {
  operationName: "TotalVolume",
  query: "query TotalVolume {\n  totalVolumeChart {\n    value24h\n    lastWeekValue\n    percentageChange24h\n    points {\n      timestamp\n      value\n      __typename\n    }\n    __typename\n  }\n}\n",
  variables: {}
}

interface IVolumeall {
  value: string;
  timestamp: string;
}

const actionsQuery = `query Actions($limit: Int, $skip: Int, $filters: ActionFilterInput) {
  actions(limit: $limit, skip: $skip, filters: $filters, sort: [TIMESTAMP_DESC]) {
    pageInfo { totalFiltered }
    actions { txnType token1 { id code smartContract } token1Amount token2 { id code smartContract } token2Amount account1 account2 }
  }
}`
const poolsQuery = `query Pools($limit: Int) { pools(limit: $limit) { pageInfo { totalFiltered } pools { code token1 { code smartContract } token2 { code smartContract } } } }`
const poolVolumeQuery = `query PoolVolume($poolCode: String!) { poolVolumeChart(poolCode: $poolCode) { points { timestamp value } } }`
const tokenPriceQuery = `query TokenPrice($tokenId: Int!) { tokenPriceChart(tokenId: $tokenId) { points { timestamp value } } }`

const graphQuery = async (query: string, variables: any) => {
  const res = await httpPost(historicalVolumeEndpoint, { query, variables })
  if (!res?.data || res.errors) throw new Error(`PayCash API error: ${JSON.stringify(res?.errors ?? res)}`)
  return res.data
}

const getActions = async (filters: any) => {
  const pageSize = 1000
  const actions: any[] = []
  let total = 0
  do {
    const page = (await graphQuery(actionsQuery, { limit: pageSize, skip: actions.length, filters })).actions
    total = page.pageInfo.totalFiltered
    if (!page.actions.length && actions.length < total) throw new Error(`PayCash actions: got ${actions.length} of ${total}`)
    actions.push(...page.actions)
  } while (actions.length < total)
  return actions
}

const getDayPoint = (points: IVolumeall[], dayString: string, what: string) => {
  const point = points.find(dayItem => dayItem.timestamp.split('T')[0] === dayString)
  if (!point) throw new Error(`PayCash API: no ${what} for ${dayString}`)
  return Number(point.value)
}

// Limit-order fills where the order owner fills its own order (account1 === account2) are self-trades:
// the account ends where it started, less fees, so they come out of volume.
// On chain the owner is in swap.pcash::limordetails and the filler signs the transfer to swap.pcash
// (e.g. tx 44107cea372d53d5f3afc68c223996d68476ab7ab3e0a9e967f14d523c9db20f, pool 340).
// Each fill is valued as PayCash values its pool: the fill's share of the pool's input on the day
// (input amounts weighted by PayCash's daily token price), times the pool's poolVolumeChart value.
const getSelfMatchedVolume = async (options: FetchOptions, dayString: string) => {
  const fromTimestamp = new Date(options.startOfDay * 1000).toISOString()
  const toTimestamp = new Date((options.startOfDay + 86400) * 1000).toISOString()
  const fills = await getActions({ txnType: 'LIMIT_ORDER_SWAP', fromTimestamp, toTimestamp })
  const selfFills = fills.filter(fill => fill.account1 === fill.account2)
  if (!selfFills.length) return 0

  const pairKey = (a: any, b: any) => [`${a.code}@${a.smartContract}`, `${b.code}@${b.smartContract}`].sort().join('/')
  const { pools, pageInfo } = (await graphQuery(poolsQuery, { limit: 10000 })).pools
  if (pools.length < pageInfo.totalFiltered) throw new Error(`PayCash pools: got ${pools.length} of ${pageInfo.totalFiltered}`)
  const poolByPair: Record<string, string> = {}
  pools.forEach((pool: any) => poolByPair[pairKey(pool.token1, pool.token2)] = pool.code)
  const poolCodes = new Set<string>(selfFills.map(fill => {
    const poolCode = poolByPair[pairKey(fill.token1, fill.token2)]
    if (!poolCode) throw new Error(`PayCash: no pool for ${fill.token1.code}/${fill.token2.code}`)
    return poolCode
  }))

  const prices: Record<number, number> = {}
  const getPrice = async (tokenId: number) => {
    if (prices[tokenId] === undefined)
      prices[tokenId] = getDayPoint((await graphQuery(tokenPriceQuery, { tokenId })).tokenPriceChart.points, dayString, `price of token ${tokenId}`)
    return prices[tokenId]
  }

  let selfMatchedVolume = 0
  for (const poolCode of poolCodes) {
    const poolVolume = getDayPoint((await graphQuery(poolVolumeQuery, { poolCode })).poolVolumeChart.points, dayString, `${poolCode} volume`)
    const actions = await getActions({ poolCode, fromTimestamp, toTimestamp })
    let poolInput = 0
    let selfInput = 0
    for (const action of actions) {
      // SWAP: token1 is what the trader pays in; LIMIT_ORDER_SWAP: token2 is what the filler pays in
      let token: any, amount: string
      if (action.txnType === 'SWAP') [token, amount] = [action.token1, action.token1Amount]
      else if (action.txnType === 'LIMIT_ORDER_SWAP') [token, amount] = [action.token2, action.token2Amount]
      else continue
      const value = Number(amount) * await getPrice(token.id)
      poolInput += value
      if (action.txnType === 'LIMIT_ORDER_SWAP' && action.account1 === action.account2) selfInput += value
    }
    if (!poolInput) throw new Error(`PayCash: no ${poolCode} swaps on ${dayString}`)
    selfMatchedVolume += poolVolume * selfInput / poolInput
  }
  return selfMatchedVolume
}

const fetch = async (options: FetchOptions) => {
  const dayString = new Date(options.toTimestamp * 1000).toISOString().split('T')[0]
  const historicalVolume: IVolumeall[] = (await httpPost(historicalVolumeEndpoint, requestBody))?.data.totalVolumeChart.points;
  let dailyVolume = getDayPoint(historicalVolume, dayString, 'total volume')
  if (dayString === '2025-10-01') {
    // remove volume from these pools
    // https://paycashswap.com/en/pool/LQMB, https://paycashswap.com/en/pool/LQKN, https://paycashswap.com/en/pool/LQC, https://paycashswap.com/en/pool/LQKF
    dailyVolume -= (75864392 + 38941142 + 5631236 + 1355978)
  }
  dailyVolume -= await getSelfMatchedVolume(options, dayString)

  return {
    dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.EOS],
  start: '2021-04-14',
  methodology: {
    Volume: 'Daily swap volume from the PayCash API, excluding limit-order fills where the order owner fills its own order.',
  },
};

export default adapter;

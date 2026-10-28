import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// https://forum.pact.foundation/t/proposal-pip-003-update-voting-is-live/87
const BUYBACK_VAULT = '0x68375e12ef94b5fcb2945745f1cd85a543d286b2ca8542c343bde19d1e197aa4'
// PACT fungible asset on Aptos, https://forum.pact.foundation/t/pact-is-going-live-on-ethereum/88
const PACT = '0xc546cc2dd26d9e9a4516b4514288bedf1085259fcb106b84b6469337f527fb92'
const PAGE_SIZE = 100

const DEPOSITS_QUERY = `query ($owner: String!, $asset: String!, $from: timestamp!, $to: timestamp!, $offset: Int!, $limit: Int!) {
  fungible_asset_activities(
    where: {
      owner_address: { _eq: $owner },
      asset_type: { _eq: $asset },
      type: { _eq: "0x1::fungible_asset::Deposit" },
      is_transaction_success: { _eq: true },
      transaction_timestamp: { _gte: $from, _lt: $to }
    },
    order_by: [{ transaction_version: asc }, { event_index: asc }],
    offset: $offset,
    limit: $limit
  ) {
    amount
  }
}`

const toIndexerTime = (timestamp: number) => new Date(timestamp * 1000).toISOString().replace('Z', '')

const fetch = async (options: FetchOptions) => {
  const { processor_status } = await sdk.chains.aptos.indexerQuery({
    query: `{ processor_status(where: { processor: { _eq: "fungible_asset_processor" } }) { last_transaction_timestamp } }`,
  })
  const indexedUntil = processor_status?.[0]?.last_transaction_timestamp
  if (!indexedUntil || new Date(indexedUntil + 'Z').getTime() / 1000 < options.endTimestamp)
    throw new Error(`aptos indexer fungible_asset_processor is at ${indexedUntil}, window ends ${toIndexerTime(options.endTimestamp)}`)

  const dailyHoldersRevenue = options.createBalances()
  const variables = { owner: BUYBACK_VAULT, asset: PACT, from: toIndexerTime(options.startTimestamp), to: toIndexerTime(options.endTimestamp), limit: PAGE_SIZE }
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { fungible_asset_activities: deposits } = await sdk.chains.aptos.indexerQuery({ query: DEPOSITS_QUERY, variables: { ...variables, offset } })
    deposits.forEach((deposit: any) => dailyHoldersRevenue.add(PACT, deposit.amount, METRIC.TOKEN_BUY_BACK))
    if (deposits.length < PAGE_SIZE) break
  }

  return { dailyHoldersRevenue }
}

const methodology = {
  HoldersRevenue: 'PACT bought back with protocol revenue and deposited into the DAO buyback vault on Aptos.',
}

const breakdownMethodology = {
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: `PACT received by the DAO buyback vault ${BUYBACK_VAULT} on Aptos, funded by the share of protocol revenue allocated to buybacks under PIP-003.`,
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.APTOS],
  start: '2026-10-07',
  methodology,
  breakdownMethodology,
}

export default adapter

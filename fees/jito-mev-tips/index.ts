/*
  Source:
  - dailyFees: Represents MEV rewards/tips paid by users/searchers.
    Collected from transfers to Jito MEV-related program addresses.
*/

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSolanaReceived } from "../../helpers/token"
import { METRIC } from "../../helpers/metrics"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const targets = [
    '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
    'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
    'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
    'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
    'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
    'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
    'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
    '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
  ]
  const receivedBalances = await getSolanaReceived({ options, targets, })
  const dailyFees = options.createBalances()
  dailyFees.addBalances(receivedBalances, METRIC.MEV_REWARDS)
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-11-01',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    fees: 'MEV/tips paid by users/searchers',
  }
}

export default adapter

/*
  Source:
  - dailyFees: Represents MEV rewards/tips paid by users/searchers.
    Collected from transfers to Jito MEV-related program addresses.
*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSolanaReceived } from "../../helpers/token"

const fetchFees = async (_a: any, _b: any, options: FetchOptions) => {

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

  const dailyFees = await getSolanaReceived({ options, targets, })

  return {
    dailyFees
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFees,
      start: '2022-11-01',
    }
  },
  isExpensiveAdapter: true,
  methodology: {
    fees: 'MEV/tips paid by users/searchers',
  }
}

export default adapter

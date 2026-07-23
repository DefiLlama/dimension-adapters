/*
  Source:
  - dailyFees: Represents MEV rewards/tips paid by users/searchers.
    Collected from transfers to Jito MEV-related program addresses.
*/

import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getSolanaReceived } from "../../helpers/token"
import { METRIC } from "../../helpers/metrics"

export const JitoTipPaymentAddresses = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
]

const fetch = async (options: FetchOptions) => {
  const receivedBalances = await getSolanaReceived({ options, targets: JitoTipPaymentAddresses })
  const dailyFees = options.createBalances()
  dailyFees.addBalances(receivedBalances, METRIC.MEV_REWARDS)
  const dailySupplySideRevenue = dailyFees.clone(0.96);
  const dailyRevenue = dailyFees.clone(0.04);
  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-11-01',
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'MEV/tips paid by users/searchers.',
    Revenue: 'Jito collects 4% from fees as revenue.',
    SupplySideRevenue: '96% of MEV rewards are distributed to users/searchers.',
    ProtocolRevenue: 'Jito collects 4% from fees as revenue.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MEV_REWARDS]: 'MEV/tips paid by users/searchers',
    },
    Revenue: {
      [METRIC.MEV_REWARDS]: 'Jito collects 4% from fees as revenue',
    },
    SupplySideRevenue: {
      [METRIC.MEV_REWARDS]: 'There are 96% MEV reward are distributed to users/searchers',
    },
    ProtocolRevenue: {
      [METRIC.MEV_REWARDS]: 'Jito collects 4% from fees as revenue',
    },
  },
}

export default adapter

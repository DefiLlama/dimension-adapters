/*
  Source:
  - dailyFees: Represents MEV rewards/tips paid by users/searchers.
    Collected from transfers to Jito MEV-related program addresses.
  - dailyRevenue: Jito's cut of the tips, estimated at 4% until 2025-07-31, while the block engine fee went to
    Jito Labs. From 2025-08-01 (JIP-24) the Block Engine / BAM fees go to the Jito DAO, and the jito-dao adapter
    (fees/jito) counts them (MEV_TIPS) with the DAO's TipRouter share (TIP_ROUTER), so they are not counted here
    again, as with jito-staked-sol. dailySupplySideRevenue stays at 96%.
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

// JIP-24: from this date the Jito DAO receives the Block Engine / BAM fees, and fees/jito books them
// (its MEV_TIPS leg starts on the same date) next to the TipRouter fee
// https://forum.jito.network/t/jip-24-jito-dao-receives-all-jito-block-engine-fees-and-future-bam-fees/860
const DAO_TIP_CUT_START = 1754006400 // 2025-08-01 00:00 UTC

const fetch = async (options: FetchOptions) => {
  const receivedBalances = await getSolanaReceived({ options, targets: JitoTipPaymentAddresses })
  const dailyFees = options.createBalances()
  dailyFees.addBalances(receivedBalances, METRIC.MEV_REWARDS)
  const dailySupplySideRevenue = dailyFees.clone(0.96);
  // from DAO_TIP_CUT_START Jito's cut is booked as revenue by fees/jito, as jito-staked-sol does with its 4%,
  // so on this child Fees exceed Revenue + SupplySideRevenue by that cut
  const dailyRevenue = options.startTimestamp < DAO_TIP_CUT_START ? dailyFees.clone(0.04) : options.createBalances();
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
    Revenue: "Jito collects 4% from fees as revenue until 2025-07-31. From 2025-08-01 Jito's cut of the tips goes to the Jito DAO and is counted in the Jito DAO adapter to avoid double counting on the parent protocol.",
    SupplySideRevenue: '96% of MEV rewards are distributed to users/searchers.',
    ProtocolRevenue: "Jito collects 4% from fees as revenue until 2025-07-31. From 2025-08-01 Jito's cut of the tips goes to the Jito DAO and is counted in the Jito DAO adapter to avoid double counting on the parent protocol.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MEV_REWARDS]: 'MEV/tips paid by users/searchers',
    },
    Revenue: {
      [METRIC.MEV_REWARDS]: 'Jito collects 4% from fees as revenue until 2025-07-31, counted in the Jito DAO adapter from 2025-08-01',
    },
    SupplySideRevenue: {
      [METRIC.MEV_REWARDS]: 'There are 96% MEV reward are distributed to users/searchers',
    },
    ProtocolRevenue: {
      [METRIC.MEV_REWARDS]: 'Jito collects 4% from fees as revenue until 2025-07-31, counted in the Jito DAO adapter from 2025-08-01',
    },
  },
}

export default adapter

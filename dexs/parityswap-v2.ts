import { CHAIN } from "../helpers/chains";
import { uniV2Exports } from "../helpers/uniswap";

// ParitySwap V2 is a Uniswap V2 fork on Robinhood Chain with the protocol fee
// switch on: swappers pay the stock 0.30% fee, 1/6 of fees (0.05% of volume)
// accrues to the protocol treasury via the standard feeTo mint, LPs keep 0.25%.
export default uniV2Exports({
  [CHAIN.ROBINHOOD]: {
    factory: '0xaA5f8c18EF9be81ffED30c223F9CD0D012a2AdB9',
    start: '2026-07-20',
    userFeesRatio: 1,
    revenueRatio: 1 / 6,
    protocolRevenueRatio: 1 / 6,
    holdersRevenueRatio: 0,
    allowReadPairs: true,
  },
}, {
  methodology: {
    Volume: 'Swap volume from Swap events on all ParitySwap V2 pairs.',
    Fees: 'Swap fees paid by traders: 0.30% of swap volume.',
    UserFees: 'Same as Fees — all fees are paid by swappers.',
    Revenue: 'Protocol treasury share: 1/6 of swap fees (0.05% of volume), accrued via the Uniswap V2 feeTo mechanism.',
    ProtocolRevenue: 'Same as Revenue.',
    SupplySideRevenue: 'LP share: 5/6 of swap fees (0.25% of volume).',
    HoldersRevenue: 'No revenue to token holders.',
  },
})

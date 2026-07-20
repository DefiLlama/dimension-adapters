import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

// ParitySwap V3 is a Uniswap V3 fork on Robinhood Chain where every pool is
// initialized with feeProtocol = 68: 25% of swap fees go to the protocol
// (factory owner), 75% to LPs. Swappers pay the standard tier fee unchanged.
export default uniV3Exports({
  [CHAIN.ROBINHOOD]: {
    factory: '0xd479E71C45aEB1E846A7B549c346D62fE77B39bA',
    start: '2026-07-20',
    userFeesRatio: 1,
    revenueRatio: 0.25,
    protocolRevenueRatio: 0.25,
    holdersRevenueRatio: 0,
  },
}, {
  methodology: {
    Volume: 'Swap volume from Swap events on all ParitySwap V3 pools.',
    Fees: 'Swap fees paid by traders at each pool\'s fee tier (0.05% / 0.30% / 1%).',
    UserFees: 'Same as Fees — all fees are paid by swappers.',
    Revenue: 'Protocol share: 25% of swap fees, set via feeProtocol at pool initialization and collected by the factory owner.',
    ProtocolRevenue: 'Same as Revenue.',
    SupplySideRevenue: 'LP share: 75% of swap fees.',
    HoldersRevenue: 'No revenue to token holders.',
  },
})

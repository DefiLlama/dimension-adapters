import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

// ParitySwap V3 is a Uniswap V3 fork on Robinhood Chain where every pool is
// initialized with feeProtocol = 68: 25% of swap fees go to the protocol
// (factory owner), 75% to LPs. Swappers pay the standard tier fee unchanged.
//
// Sources:
// - Factory (Blockscout-verified; UniswapV3Pool.initialize hardcodes
//   feeProtocol = 68 = 4 + (4 << 4), i.e. 1/4 of fees per direction = 25%):
//   https://robinhoodchain.blockscout.com/address/0xd479E71C45aEB1E846A7B549c346D62fE77B39bA?tab=contract
// - Observable live: slot0().feeProtocol == 68 on the WETH/USDG 0.30% pool:
//   https://robinhoodchain.blockscout.com/address/0x12eEe2FAF5d447203fe371e564Bd884D8Aa3A679?tab=read_contract
// - TVL adapter: https://github.com/DefiLlama/DefiLlama-Adapters/pull/20143
const adapter = uniV3Exports({
  [CHAIN.ROBINHOOD]: {
    factory: '0xd479E71C45aEB1E846A7B549c346D62fE77B39bA',
    start: '2026-07-20',
    userFeesRatio: 1,
    revenueRatio: 0.25,
    protocolRevenueRatio: 0.25,
    holdersRevenueRatio: 0,
  },
})

adapter.methodology = {
  Volume: 'Swap volume from Swap events on all ParitySwap V3 pools.',
  Fees: 'Swap fees paid by traders at each pool\'s fee tier (0.05% / 0.30% / 1%).',
  UserFees: 'Same as Fees — all fees are paid by swappers.',
  Revenue: 'Protocol share: 25% of swap fees, set via feeProtocol at pool initialization and collected by the factory owner.',
  ProtocolRevenue: 'Same as Revenue.',
  SupplySideRevenue: 'LP share: 75% of swap fees.',
  HoldersRevenue: 'No revenue to token holders.',
}

adapter.breakdownMethodology = {
  Fees: {
    'Token Swap Fees': 'Swap fees paid by traders at each pool\'s fee tier (0.05% / 0.30% / 1%).',
  },
  UserFees: {
    'Trading fees': 'Swap fees paid directly by traders.',
  },
  Revenue: {
    'Protocol fees': 'Protocol share: 25% of swap fees (feeProtocol = 68, set at pool initialization), collected by the factory owner.',
  },
  ProtocolRevenue: {
    'Protocol fees': 'Protocol share: 25% of swap fees (feeProtocol = 68, set at pool initialization), collected by the factory owner.',
  },
  SupplySideRevenue: {
    'LP fees': 'LP share: 75% of swap fees retained by in-range liquidity providers.',
  },
  HoldersRevenue: {
    'Tokenholder fees': 'No revenue to token holders.',
  },
}

export default adapter

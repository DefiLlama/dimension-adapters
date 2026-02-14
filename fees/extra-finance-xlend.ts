import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";
import { METRIC } from "../helpers/metrics";

const methodology = {
  Fees: 'Include borrow interest, flashloan fees, and liquidation fees paid by borrowers.',
  Revenue: 'Amount of fees retained by Extra Finance xLend protocol.',
  SupplySideRevenue: 'Amount of fees distributed to lenders.',
  ProtocolRevenue: 'Amount of fees retained by Extra Finance xLend protocol.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'All interest paid by borrowers across all lending markets.',
    [METRIC.LIQUIDATION_FEES]: 'Fees from liquidation penalties and bonuses when positions are liquidated.',
    [METRIC.FLASHLOAN_FEES]: 'Fees paid by users executing flashloans.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol share of interest paid by borrowers (reserve factor).',
    [METRIC.LIQUIDATION_FEES]: 'Protocol share of liquidation fees.',
    [METRIC.FLASHLOAN_FEES]: 'Protocol share of flashloan fees.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Interest distributed to lenders who supply capital to the protocol.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation bonuses paid to liquidators.',
    [METRIC.FLASHLOAN_FEES]: 'Flashloan fees distributed to lenders.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Protocol share of interest paid by borrowers (reserve factor).',
    [METRIC.LIQUIDATION_FEES]: 'Protocol share of liquidation fees.',
    [METRIC.FLASHLOAN_FEES]: 'Protocol share of flashloan fees.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    ...aaveExport({
      [CHAIN.OPTIMISM]: {
        start: '2024-11-07',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x345D2827f36621b02B783f7D5004B4a2fec00186',
            dataProvider: '0xCC61E9470B5f0CE21a3F6255c73032B47AaeA9C0',
          },
        ],
      },
      [CHAIN.BASE]: {
        start: '2024-03-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x09b11746DFD1b5a8325e30943F8B3D5000922E03',
            dataProvider: '0x1566DA4640b6a0b32fF309b07b8df6Ade40fd98D',
          },
        ],
      },
    })
  }
}

export default adapter

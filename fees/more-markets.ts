import { SimpleAdapter } from '../adapters/types'
import { AaveAdapterExportConfig, aaveExport } from '../helpers/aave'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

// MORE Markets was exploited on 2026-11-16 starting 17:30:15 UTC. Flow Foundation statement
// (x.com/flow_blockchain, 2026-11-16): "an attacker used flash loans to open and then liquidate their
// own positions in MORE Markets' ankrFLOW/WFLOW market. A flaw in how MORE's contracts handled these
// liquidations cleared the collateral without clearing the matching WFLOW debt, allowing WFLOW to be
// withdrawn." MORE then paused the protocol.
//
// These 11 transactions, all sent by the attacker EOA 0xe1ea6f2365215389f9dcd50a51c974313bf6785c to its
// helper contract 0x9a8cc604b3534eaa1a8627c1d6f6084857bf2765, hold 154 of the 155 LiquidationCall logs of
// that day and all 308 FlashLoan logs. In every liquidation the liquidator IS the liquidated borrower
// (154 single-use accounts, one liquidation each), so the 6% bonus the adapter books as a fee is
// collateral the attacker moved from its own position to its own wallet. The ankrFLOW flashloan premiums
// from the same transactions (5 bps, of which 4/10000 is the protocol's and the rest is cumulated into
// the liquidity index) are almost all of that day's ankrFLOW index growth. AGENTS.md: exploit fees are
// excluded, not whitelisted, so the liquidations, the flashloan premiums and the supplier interest those
// premiums added are all dropped. The 155th liquidation of the day (a real third-party USDF liquidation
// at block 85328088) still counts.
const ExploitTxHashes = [
  '0xdf9e3ed4858103569f684166d9833e1980b6ba96334c9a8ec172b4e2aa1d15d8', // block 85326751, 17:30:15Z
  '0xb18d3cf90d8b39a1ff6736b4692a4efd0064dbb23f5e7800e245272aff50ce8c', // block 85326790, 17:30:45Z
  '0xcb47d6bc68226be0b1f609095c97e3abc0fe0eace4ebc924d7898a3a7da9d046', // block 85326825, 17:31:14Z
  '0x6743b6fade27a407a251781910e526d927863165ce1e6a59c8b27d01376c4aae', // block 85326861, 17:31:42Z
  '0xdd6dce5796d9f17bdd81363c7cbcd156be6d624fe080df387e095ae3e26231b6', // block 85326897, 17:32:12Z
  '0x9979cedf3a5c55f888a3fb142c82adc55d0d8b3b0670c603ab905132193f52cc', // block 85326932, 17:32:40Z
  '0xaf1336e3199aa3c369a59b0b56cb2a5abf4ae9170df838ad77d38c83852e8b2b', // block 85326972, 17:33:12Z
  '0xf2fbc2d3900b770c7a0fb862571eff24626cd214d29466a868eaa57aef695cbc', // block 85327008, 17:33:41Z
  '0x604867f877952e617d77b57b4b24c8a99dfd01b2d5046ff4a97952e74e7ef138', // block 85327042, 17:34:08Z
  '0x41c8cb0dc975ecc6796d9dc2e459ec13144d8ce260a87f26ff10b9c369c3a716', // block 85327077, 17:34:35Z
  '0x59f730f44bbff02b3927c294279e00767dcd24aa7716969253a21244dd5667ad', // block 85327267, 17:37:07Z
]

export const chainConfig: Record<string, AaveAdapterExportConfig> = {
  [CHAIN.FLOW]: {
    start: '2025-01-14',
    pools: [
      {
        version: 3,
        lendingPoolProxy: '0xbC92aaC2DBBF42215248B5688eB3D3d2b32F2c8d',
        dataProvider: '0x79e71e3c0EDF2B88b0aB38E9A1eF0F6a230e56bf',
        excludeTxHashes: ExploitTxHashes,
      },
    ],
  },
}

const methodology = {
  Fees: 'Interest paid by borrowers, flashloan premiums and liquidation bonuses paid by liquidated borrowers. The 2026-11-16 exploit is excluded: its self-liquidations, its flashloan premiums and the supplier interest those premiums added through the liquidity index.',
  Revenue: 'The reserve factor share of borrow interest, the protocol share of flashloan premiums and the protocol share of liquidation bonuses, all kept by the MORE Markets treasury. The 2026-11-16 exploit is excluded from each of these.',
  SupplySideRevenue: 'Interest and flashloan premiums paid to suppliers, plus the liquidation bonuses kept by liquidators. The 2026-11-16 exploit is excluded: its liquidation bonuses and the supplier interest its flashloan premiums added through the liquidity index.',
  ProtocolRevenue: 'The reserve factor share of borrow interest, the protocol share of flashloan premiums and the protocol share of liquidation bonuses, all kept by the MORE Markets treasury. The 2026-11-16 exploit is excluded from each of these.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]: 'Interest paid by borrowers on every market, measured from the growth of the liquidity index over the window. Supplier interest added by the 2026-11-16 exploit flashloan premiums is not counted.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation bonuses paid by liquidated borrowers, in the seized collateral. The 154 self-liquidations of the 2026-11-16 exploit are not counted.',
    [METRIC.FLASHLOAN_FEES]: 'Protocol share of flashloan premiums. The suppliers\' share accrues to the liquidity index and is counted in borrow interest. Premiums from the 2026-11-16 exploit transactions are not counted.',
  },
  Revenue: {
    [METRIC.BORROW_INTEREST]: 'Reserve factor share of borrow interest. The reserve factor share of interest created by the 2026-11-16 exploit flashloan premiums is not counted.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation protocol fee share of liquidation bonuses. The 2026-11-16 exploit liquidations are not counted.',
    [METRIC.FLASHLOAN_FEES]: 'Protocol share of flashloan premiums. Premiums from the 2026-11-16 exploit transactions are not counted.',
  },
  SupplySideRevenue: {
    [METRIC.BORROW_INTEREST]: 'Interest distributed to suppliers, including their share of flashloan premiums. Supplier interest added by the 2026-11-16 exploit flashloan premiums is not counted.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation bonuses kept by liquidators. The 154 self-liquidations of the 2026-11-16 exploit are not counted.',
  },
  ProtocolRevenue: {
    [METRIC.BORROW_INTEREST]: 'Reserve factor share of borrow interest kept by the MORE Markets treasury. The reserve factor share of interest created by the 2026-11-16 exploit flashloan premiums is not counted.',
    [METRIC.LIQUIDATION_FEES]: 'Liquidation protocol fee share kept by the MORE Markets treasury. The 2026-11-16 exploit liquidations are not counted.',
    [METRIC.FLASHLOAN_FEES]: 'Protocol share of flashloan premiums kept by the MORE Markets treasury. Premiums from the 2026-11-16 exploit transactions are not counted.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: aaveExport(chainConfig),
  methodology,
  breakdownMethodology,
}

export default adapter

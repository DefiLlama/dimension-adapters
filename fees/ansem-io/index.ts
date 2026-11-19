import ADDRESSES from '../../helpers/coreAssets.json'
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryAllium } from "../../helpers/allium";
import { getSolanaReceived } from "../../helpers/token";

// Ansem.io — launchpad of the $ANSEM community, built on top of pump.fun.
// - Fee sweeper GgUxiS1r...: created within an hour of the distributor deploy.
//   Because Ansem controls every launch wallet, the platform is each coin's
//   on-chain creator: launch wallets claim the pump.fun creator-fee vaults
//   (bonding curve) and, after graduation, the paired AMM / fee-program vaults,
//   then forward everything to the sweeper, which consolidates into the
//   treasury D6aRAdQx... Sweeps are batched, so fees land on sweep day rather than accrual day.
// - Gold/Diamond launch tiers require burning $ANSEM from the creator's wallet.
// The community-airdrop buy (min ~0.87 SOL per launch) is not counted: that SOL
// goes into the coin's own bonding curve, not to the platform, and the trade is
// already part of pump.fun's volume and fees.
const FEE_SWEEPER = 'GgUxiS1r3NEa3a62QHYS5k5fNzn3fDQ1EwSX42R3TUiG'
const TREASURY = 'D6aRAdQxondRXz8WuYnSzc3a571oDD1ZecLh2SEdf1oS'
const ANSEM_MINT = '9cRCn9rGT8V2imeM2BaKs13yhMEais3ruM3rPvTGpump'

const LABEL = {
  PlatformFees: METRIC.CREATOR_FEES,
  AnsemBurn: 'ANSEM Tier Burns',
} as const

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()

  const received = await getSolanaReceived({
    options,
    targets: [FEE_SWEEPER, TREASURY],
    blacklists: [FEE_SWEEPER, TREASURY],
    mints: [ADDRESSES.solana.SOL],
  })
  dailyFees.addBalances(received, LABEL.PlatformFees)
  dailyProtocolRevenue.addBalances(received, LABEL.PlatformFees)

  const rows = await queryAllium(`
    SELECT COALESCE(SUM(raw_amount), 0) AS burned
    FROM solana.assets.transfers
    WHERE mint = '${ANSEM_MINT}'
      AND type IN ('burn', 'burnChecked')
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp <  TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `)
  const burned = rows?.[0]?.burned ?? 0
  dailyFees.add(ANSEM_MINT, burned, LABEL.AnsemBurn)
  dailyHoldersRevenue.add(ANSEM_MINT, burned, LABEL.AnsemBurn)

  const dailyRevenue = options.createBalances()
  dailyRevenue.addBalances(dailyProtocolRevenue)
  dailyRevenue.addBalances(dailyHoldersRevenue)

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const breakdownMethodology = {
  Fees: {
    [LABEL.PlatformFees]: "Pump.fun creator/partner fee shares on Ansem-launched coins, captured by the platform's launch wallets (Ansem is each coin's on-chain creator) and swept to the treasury.",
    [LABEL.AnsemBurn]: '$ANSEM permanently burned to unlock Gold and Diamond launch tiers.',
  },
  Revenue: {
    [LABEL.PlatformFees]: 'Captured pump.fun fee shares and platform payments, kept by the treasury.',
    [LABEL.AnsemBurn]: '$ANSEM burned, accruing to remaining $ANSEM holders.',
  },
  ProtocolRevenue: {
    [LABEL.PlatformFees]: 'Captured pump.fun fee shares and platform payments, kept by the treasury.',
  },
  HoldersRevenue: {
    [LABEL.AnsemBurn]: '$ANSEM burned, accruing to remaining $ANSEM holders.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  chains: [CHAIN.SOLANA],
  start: '2026-08-16',
  doublecounted: true, // creator fees are already counted by pump.fun
  dependencies: [Dependencies.ALLIUM],
  breakdownMethodology,
  methodology: {
    Fees: "Includes Pump.fun creator/partner fee shares earned on every coin launched using the protocol and $ANSEM tokens burned to unlock launch tiers.",
    Revenue: 'Captured pump.fun fee shares and platform payments plus $ANSEM tier burns.',
    ProtocolRevenue: 'Captured pump.fun fee shares and platform payments kept by the Ansem.io treasury.',
    HoldersRevenue: '$ANSEM permanently burned for Gold/Diamond launch tiers, accruing to remaining $ANSEM holders.',
  },
}

export default adapter

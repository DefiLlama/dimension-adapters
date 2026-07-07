import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// Ensuro is a decentralised insurance protocol. Each policy's `NewPolicy` event
// splits the premium into: premium = purePremium + jrCoc + srCoc +
// ensuroCommission + partnerCommission.
//   Fees       = premium - claims                          (what users pay, net of payouts)
// Claims (`PolicyResolved` payouts) are netted out of Fees and Revenue.
// V2 (Polygon) and V3 (Ethereum) differ only in extra struct fields; same components.
// Policy.sol: https://github.com/ensuro/ensuro/blob/main/contracts/Policy.sol
const abis = {
  // policyResolved
  policyResolved: 'event PolicyResolved(address indexed riskModule, uint256 indexed policyId, uint256 payout)',
  // V2 (Polygon)
  newPolicyV2: 'event NewPolicy(address indexed riskModule, (uint256 id, uint256 payout, uint256 premium, uint256 jrScr, uint256 srScr, uint256 lossProb, uint256 purePremium, uint256 ensuroCommission, uint256 partnerCommission, uint256 jrCoc, uint256 srCoc, address riskModule, uint40 start, uint40 expiration) policy)',
  // V3 (Ethereum) 
  newPolicyV3: 'event NewPolicy(address indexed riskModule, (uint256 id, uint256 payout, uint256 jrScr, uint256 srScr, uint256 lossProb, uint256 purePremium, uint256 ensuroCommission, uint256 partnerCommission, uint256 jrCoc, uint256 srCoc, uint40 start, uint40 expiration) policy)',
}

const config: Record<string, { policyPool: string; token: string; eventAbi: string; start: string }> = {
  [CHAIN.POLYGON]: {
    policyPool: '0xD74A28274C4B1a116aDd9857FC0E8F5e8fAC2497',
    token: ADDRESSES.polygon.USDC_CIRCLE,
    eventAbi: abis.newPolicyV2,
    start: '2022-11-30',
  },
  [CHAIN.ETHEREUM]: {
    policyPool: '0xd81A8B5bE59cEAE0f9E27455A998B4fDac9fA0a3',
    token: ADDRESSES.ethereum.USDC,
    eventAbi: abis.newPolicyV3,
    start: '2026-03-18',
  },
}

const fetch = async (options: FetchOptions) => {
  const { policyPool, token, eventAbi } = config[options.chain]

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const logs = await options.getLogs({ target: policyPool, eventAbi })
  for (const { policy } of logs) {
    // Fees: full premium paid by the policyholder when buying coverage
    dailyFees.add(token, policy.purePremium, 'Insurance Premium')
    dailyFees.add(token, policy.ensuroCommission, 'Insurance Premium')
    dailyFees.add(token, policy.partnerCommission, 'Insurance Premium')
    dailyFees.add(token, policy.jrCoc, 'Insurance Premium')
    dailyFees.add(token, policy.srCoc, 'Insurance Premium')

    // Revenue: Ensuro's protocol commission
    dailyRevenue.add(token, policy.ensuroCommission, 'Protocol Commission')

    // ProtocolRevenue: Ensuro's commission goes to the treasury
    dailyProtocolRevenue.add(token, policy.ensuroCommission, 'Protocol Commission')

    // SupplySideRevenue: cost of capital to LPs + commission to the distributing partner + pure premium
    dailySupplySideRevenue.add(token, policy.jrCoc, 'Junior LP Cost of Capital')
    dailySupplySideRevenue.add(token, policy.srCoc, 'Senior LP Cost of Capital')
    dailySupplySideRevenue.add(token, policy.partnerCommission, 'Partner Commission')
    dailySupplySideRevenue.add(token, policy.purePremium, 'Pure Premium')
  }

  // Claims paid to policyholders
  const resolvedLogs = await options.getLogs({ target: policyPool, eventAbi: abis.policyResolved })
  for (const log of resolvedLogs) {
    const payout = BigInt(log.payout)
    if (payout === 0n) continue
    dailyFees.add(token, -payout, 'Claims Paid')
    dailySupplySideRevenue.add(token, -payout, 'Claims Paid')
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: 'Insurance premiums paid by policyholders when buying coverage (pure premium + cost of capital + Ensuro commission + partner commission), net of insurance claims paid out during the period.',
  Revenue: 'Ensuro protocol commission retained by the Ensuro treasury.',
  ProtocolRevenue: 'Ensuro protocol commission retained by the Ensuro treasury.',
  SupplySideRevenue: 'Cost of capital paid to senior and junior eToken liquidity providers, plus commissions paid to risk partners (the risk modules that originate policies) plus pure premium net of claims paid out.',
}

const breakdownMethodology = {
  Fees: {
    'Insurance Premium': 'Total premium paid by policyholders when buying coverage (purePremium + jrCoc + srCoc + ensuroCommission + partnerCommission).',
    'Claims Paid': 'Insurance claim payouts to policyholders during the period (PolicyResolved events), deducted from pure premium -> Junior LP -> Senior LP.',
  },
  Revenue: {
    'Protocol Commission': 'Ensuro protocol commission charged on each policy.',
  },
  ProtocolRevenue: {
    'Protocol Commission': 'Ensuro protocol commission allocated to the Ensuro treasury.',
  },
  SupplySideRevenue: {
    'Junior LP Cost of Capital': 'Cost of capital paid to junior eToken liquidity providers for locking junior solvency capital.',
    'Senior LP Cost of Capital': 'Cost of capital paid to senior eToken liquidity providers for locking senior solvency capital.',
    'Partner Commission': 'Commission paid to the risk partner / risk module that originated the policy.',
    'Pure Premium': 'Pure premium retained in the protocol insurance pool (PremiumsAccount) as reserves to cover expected claims.',
    'Claims Paid': 'Insurance claim payouts to policyholders during the period (PolicyResolved events), deducted from pure premium -> Junior LP -> Senior LP.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: config,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
}

export default adapter

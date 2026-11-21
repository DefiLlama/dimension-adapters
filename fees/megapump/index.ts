import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { LABEL, chainConfig, collectCurveActivity } from "./shared";

// MegaPump launchpad fees (see shared.ts for the sources). The bonding-curve volume is dexs/megapump.ts,
// the DEX where tokens graduate is the separate megapump-dex listing.
//
// dailyFees              = trade fees (platform + creator + referrer slices) + graduation fees
// dailyRevenue           = platform slice of the trade fees + graduation fees   (== dailyProtocolRevenue)
// dailySupplySideRevenue = creator slice + referrer slice of the trade fees
// There is no MegaPump token: nothing goes to holders. Creation is free: no launch fee.

const fetch = async (options: FetchOptions) => {
  const { dailyFees, dailyRevenue, dailySupplySideRevenue } = await collectCurveActivity(options)
  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'A 1.25% fee on the quote side (ETH, USDm or MEGA) of every bonding-curve buy and sell, read per trade from the Trade event (platformFee + creatorFee + referrerFee), plus the fixed graduation fee the factory keeps when a curve graduates to the DEX. Creating a token is free. Swaps after graduation belong to the MegaPump DEX listing.',
  UserFees: 'Same as Fees: every fee is paid by the traders of the curve.',
  Revenue: 'The protocol slice of the trade fee (1% of the trade, minus what goes to a referrer) plus the graduation fees.',
  ProtocolRevenue: 'Same as Revenue: all of it goes to the protocol treasury.',
  SupplySideRevenue: 'The creator slice of the trade fee (0.25% of the trade, claimable by the token\'s creator) and the referrer slice (taken out of the protocol\'s 1% on referred trades).',
}

const breakdownMethodology = {
  Fees: {
    [LABEL.tradingFees]: '1.25% bonding-curve trade fee on the quote side of every buy and sell (platformFee + creatorFee + referrerFee of the Trade event).',
    [LABEL.graduationFees]: 'Fixed fee kept by the factory when a curve graduates to the DEX (graduationFee of the token\'s quote, capped at a tenth of the raise).',
  },
  UserFees: {
    [LABEL.tradingFees]: '1.25% bonding-curve trade fee on the quote side of every buy and sell (platformFee + creatorFee + referrerFee of the Trade event).',
    [LABEL.graduationFees]: 'Fixed fee kept by the factory when a curve graduates to the DEX (graduationFee of the token\'s quote, capped at a tenth of the raise).',
  },
  Revenue: {
    [LABEL.tradingToProtocol]: 'Protocol slice of the trade fee (platformFee of the Trade event: 1% of the trade, minus the referrer slice).',
    [LABEL.graduationToProtocol]: 'Graduation fee, kept by the protocol.',
  },
  ProtocolRevenue: {
    [LABEL.tradingToProtocol]: 'Protocol slice of the trade fee (platformFee of the Trade event: 1% of the trade, minus the referrer slice).',
    [LABEL.graduationToProtocol]: 'Graduation fee, kept by the protocol.',
  },
  SupplySideRevenue: {
    [LABEL.tradingToCreators]: 'Creator slice of the trade fee (creatorFee of the Trade event: 0.25% of the trade, 0 when the creator trades its own token), claimable by the token\'s creator.',
    [LABEL.tradingToReferrers]: 'Referrer slice of the trade fee (referrerFee of the Trade event), taken out of the protocol\'s 1% and claimable by the referrer.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter;

// fees/primestaking/index.ts

/*
  PrimeStaking (psXDC) fees & revenue

   This adapter tracks PrimeStaking's XDC liquid staking vault, PrimeStakedXDC_V3_2
   an ERC-4626 vault deployed at block 104591628 (2026-07-06). Stakers deposit XDC and receive psXDC shares; 
   there is no separate reward token — instead, masternode rewards periodically flow into the
   vault via a RewardsDistributed event, raising the psXDC share price.

   Each RewardsDistributed(sender, grossAmount, fee) event carries the gross reward amount
   for that distribution and the protocol's fee cut of it;
   The fee rate is governed by rewardFeeBps, confirmed on-chain at 0
   RewardsDistributed has fired multiple times (e.g. on 2026-08-24) with real, varying gross amounts while fee has been 0 throughout,
   so dailyRevenue report 0 today and dailySupplySideRevenue carries real signal
   until governance activates the fee.

   Scope: this PR covers the V3.2 vault only. Partner Staking pools (via
   PartnerVaultRegistry at 0x325DEEA5C7c0Ce0D774c4A67EcCaAf1cF8953a67, fixed 15% fee,
   likely same event signature) and the psXDC/XDC spot DEX are known follow-ups, deliberately excluded here
*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const VAULT_ADDRESS = "0xDc74c0DaED82ae94486DeeF22991d2F54173c734";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const rewardsDistributedLogs = await options.getLogs({
    target: VAULT_ADDRESS,
    eventAbi:
      "event RewardsDistributed(address indexed sender, uint256 grossAmount, uint256 fee)",
  });

  for (const log of rewardsDistributedLogs) {
    const grossAmount = log.grossAmount; 
    const fee = log.fee; 
    const supplySideAmount = grossAmount - fee; 

    dailyFees.addGasToken(grossAmount, METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(fee, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addGasToken(supplySideAmount, METRIC.STAKING_REWARDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // RewardsDistributed fires only a few times a month, so hourly re-fetching just
  // repeats empty log queries with no new data almost every run
  pullHourly: false, 
  fetch,
  chains: [CHAIN.XDC],
  start: "2026-07-06",
  methodology: {
    Fees: "All gross masternode reward XDC distributed into the PrimeStakedXDC_V3_2 (psXDC) vault via each RewardsDistributed event's grossAmount, before any protocol fee split. Currently no fee is skimmed, so all of this amount currently flows through to stakers as SupplySideRevenue.",
    Revenue: "100% of the protocol fee goes to the on-chain feeRecipient with no further split.",
    SupplySideRevenue: "Gross rewards distributed to the psXDC vault (RewardsDistributed.grossAmount) minus the protocol fee. This is what backs psXDC's share-price appreciation for stakers.",
  },
};

export default adapter;
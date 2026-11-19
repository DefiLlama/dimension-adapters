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

   Categorization follows DefiLlama's documented liquid-staking convention (same treatment
   as the Lido adapter, fees/lido/index.ts): gross validator/masternode rewards are the total
   value the protocol generates for stakers and are booked as dailyFees, with the protocol's
   cut as dailyRevenue and the staker-retained remainder as dailySupplySideRevenue.

   Scope: this PR covers the V3.2 vault only. Partner Staking pools (via
   PartnerVaultRegistry at 0x325DEEA5C7c0Ce0D774c4A67EcCaAf1cF8953a67, fixed 15% fee,
   likely same event signature) and the psXDC/XDC spot DEX are known follow-ups, deliberately excluded here
*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const VAULT_ADDRESS = "0xDc74c0DaED82ae94486DeeF22991d2F54173c734";

const REVENUE_LABEL = "Protocol fee to feeRecipient";
const SUPPLY_SIDE_LABEL = "Net rewards to psXDC holders";

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
    dailyRevenue.addGasToken(fee, REVENUE_LABEL);
    dailySupplySideRevenue.addGasToken(supplySideAmount, SUPPLY_SIDE_LABEL);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true, 
  fetch,
  chains: [CHAIN.XDC],
  start: "2026-07-06",
  methodology: {
    Fees: "All gross masternode reward XDC distributed into the PrimeStakedXDC_V3_2 (psXDC) vault via each RewardsDistributed event's grossAmount, before any protocol fee split. Currently no fee is skimmed, so all of this amount currently flows through to stakers as SupplySideRevenue.",
    Revenue: "100% of the protocol fee (RewardsDistributed.fee) goes to the on-chain feeRecipient with no further split.",
    ProtocolRevenue: "100% of the protocol fee (RewardsDistributed.fee) goes to the feeRecipient with no further split.",
    SupplySideRevenue: "Gross rewards distributed to the psXDC vault (RewardsDistributed.grossAmount) minus the protocol fee. This is what backs psXDC's share-price appreciation for stakers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: "Gross masternode/validator rewards distributed into the vault via RewardsDistributed.grossAmount, before any fee split.",
    },
    Revenue: {
      [REVENUE_LABEL]: "Protocol's fee cut of each distribution (RewardsDistributed.fee), paid to the on-chain feeRecipient. Currently 0 via rewardFeeBps.",
    },
    ProtocolRevenue: {
      [REVENUE_LABEL]: "Same flow as Revenue — the feeRecipient is the protocol treasury, so 100% of the fee cut is protocol-retained with no operator split.",
    },
    SupplySideRevenue: {
      [SUPPLY_SIDE_LABEL]: "Gross rewards (RewardsDistributed.grossAmount) minus the protocol fee (RewardsDistributed.fee), reflected in psXDC's rising share price.",
    },
  },
};

export default adapter;

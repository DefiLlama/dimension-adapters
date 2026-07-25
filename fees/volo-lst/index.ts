import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { queryEvents } from "../../helpers/sui";

// https://volosui.gitbook.io/volo/liquid-staking/volo-liquid-staking-api-reference
const PACKAGE =
  "0x68d22cf8bdbcd11ecba1e094922873e4080d4d11133e2443fddda0bfd11dae20";

const fetchVoloLst = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [epochEvents, stakeEvents, unstakeEvents] = await Promise.all([
    queryEvents({ eventType: `${PACKAGE}::stake_pool::EpochChangedEvent`, options }),
    queryEvents({ eventType: `${PACKAGE}::stake_pool::StakeEventExt`, options }),
    queryEvents({ eventType: `${PACKAGE}::stake_pool::UnstakeEventExt`, options }),
  ]);

  for (const e of epochEvents) {
    const grossRewards = Number(e.new_sui_supply) - Number(e.old_sui_supply);
    const protocolFee = Number(e.reward_fee);
    if (grossRewards > 0) {
      dailyFees.addCGToken("sui", grossRewards / 1e9, METRIC.STAKING_REWARDS);
      dailyRevenue.addCGToken("sui", protocolFee / 1e9, METRIC.PERFORMANCE_FEES);
      dailySupplySideRevenue.addCGToken("sui", (grossRewards - protocolFee) / 1e9, METRIC.STAKING_REWARDS);
    }
  }

  for (const e of stakeEvents) {
    const stakeFee = Number(e.fee_amount);
    if (stakeFee > 0) {
      dailyFees.addCGToken("sui", stakeFee / 1e9, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.addCGToken("sui", stakeFee / 1e9, METRIC.MINT_REDEEM_FEES);
    }
  }

  for (const e of unstakeEvents) {
    const unstakeProtocolFee = Number(e.fee_amount);
    const redistributionAmount = Number(e.redistribution_amount);
    const totalUnstakeFee = unstakeProtocolFee + redistributionAmount;
    if (totalUnstakeFee > 0) {
      dailyFees.addCGToken("sui", totalUnstakeFee / 1e9, METRIC.MINT_REDEEM_FEES);
      dailyRevenue.addCGToken("sui", unstakeProtocolFee / 1e9, METRIC.MINT_REDEEM_FEES);
      dailySupplySideRevenue.addCGToken("sui", redistributionAmount / 1e9, METRIC.MINT_REDEEM_FEES);
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Gross staking rewards earned by vSUI holders each epoch plus stake/unstake fees paid by users.",
  Revenue:
    "Protocol performance fee on staking rewards plus the protocol's share of stake and unstake fees.",
  ProtocolRevenue:
    "Protocol performance fee on staking rewards plus stake/unstake fees retained by the protocol.",
  SupplySideRevenue:
    "Net staking rewards distributed to vSUI holders (gross rewards minus performance fee) plus the portion of unstake fees redistributed back to the pool.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: "Gross SUI staking rewards accrued each epoch across all vSUI holders.",
    [METRIC.MINT_REDEEM_FEES]: "Fees charged on stake and unstake operations.",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "10% performance fee charged by the protocol on epoch staking rewards.",
    [METRIC.MINT_REDEEM_FEES]: "Protocol share of stake and unstake fees.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "10% performance fee charged by the protocol on epoch staking rewards.",
    [METRIC.MINT_REDEEM_FEES]: "Protocol share of stake and unstake fees.",
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: "Net staking rewards distributed to vSUI holders (90% of gross epoch rewards).",
    [METRIC.MINT_REDEEM_FEES]: "Unstake fee portion returned to the pool, increasing the SUI backing per vSUI for remaining holders.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchVoloLst,
      start: "2025-05-09",
    },
  },
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;

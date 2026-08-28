import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Kayen Finance LST: liquid staking of native CHZ on Chiliz.
//
// stCHZ does not rebase. Balances are fixed shares and validator rewards show up as a
// rise in the CHZ redeemable per share. ChilizDepositor.totalDeposits() reports the
// pooled CHZ already net of the protocol fee, so the CHZ that accrued to holders over
// a window is the rate delta applied to the shares outstanding, and grossing that up
// by the fee rate recovers the validator rewards earned in total.
//
// https://chiliscan.com/address/0xBF4ca6F798b2e342E36dc2eC80667B58CF480787 (stCHZ)
// https://chiliscan.com/address/0xc3cbf2c6b3ea81f1A8a9fd24D8179B6F39860DB7 (ChilizDepositor)
// https://chiliscan.com/address/0xA603d53Fd1435dF23A5C0FE74c4c6E4ed3CE081C (ProtocolConfig)
const STCHZ = '0xBF4ca6F798b2e342E36dc2eC80667B58CF480787'
const CHILIZ_DEPOSITOR = '0xc3cbf2c6b3ea81f1A8a9fd24D8179B6F39860DB7'
const PROTOCOL_CONFIG = '0xA603d53Fd1435dF23A5C0FE74c4c6E4ed3CE081C'

const abi = {
  totalDeposits: 'uint256:totalDeposits',
  totalSupply: 'uint256:totalSupply',
  // Fee taken from validator rewards, as a 1e18-scaled fraction. Read rather than
  // hardcoded so a governance change is picked up without touching the adapter.
  protocolFeeRate: 'uint256:protocolFeeRate',
}

const fetch = async (options: FetchOptions) => {
  const [depositsBefore, supplyBefore] = await options.fromApi.batchCall([
    { target: CHILIZ_DEPOSITOR, abi: abi.totalDeposits },
    { target: STCHZ, abi: abi.totalSupply },
  ])
  const [depositsAfter, supplyAfter, feeRate] = await options.toApi.batchCall([
    { target: CHILIZ_DEPOSITOR, abi: abi.totalDeposits },
    { target: STCHZ, abi: abi.totalSupply },
    { target: PROTOCOL_CONFIG, abi: abi.protocolFeeRate },
  ])

  const rateBefore = Number(depositsBefore) / Number(supplyBefore)
  const rateAfter = Number(depositsAfter) / Number(supplyAfter)
  const feeShare = Number(feeRate) / 1e18

  // The rate is a step function: validator rewards land in one lump per epoch and the
  // rate is flat in between, so the shares that earned a step are the ones outstanding
  // when the window opened. Pricing a step against the closing supply would credit
  // depositors who arrived after it was earned. On a pool that grew from 7.1M to 8.9M
  // CHZ in a day, that overstates the reward by a quarter.
  //
  // Delegating also rounds down to whole units of the chain's staking precision, so a
  // window can land a hair below the previous rate. Floor at zero rather than report a
  // negative fee for what is a rounding artifact.
  const holdersYield = Math.max(0, (rateAfter - rateBefore) * Number(supplyBefore))

  const dailyFees = options.createBalances()
  dailyFees.addGasToken(holdersYield / (1 - feeShare), METRIC.STAKING_REWARDS)

  const dailyRevenue = dailyFees.clone(feeShare, METRIC.PROTOCOL_FEES)
  const dailySupplySideRevenue = dailyFees.clone(1 - feeShare, METRIC.STAKING_REWARDS)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  }
}

const methodology = {
  Fees: 'Total CHZ staking rewards earned by the CHZ staked through Kayen Finance LST.',
  Revenue: 'Protocol fee taken from those rewards, at the rate ProtocolConfig holds at the time of the call.',
  ProtocolRevenue: 'All revenue goes to the protocol fee vault.',
  HoldersRevenue: 'No share of the rewards goes to token holders.',
  SupplySideRevenue: 'The rest of the rewards accrue to stCHZ holders through the rising CHZ per stCHZ rate.',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.STAKING_REWARDS]: 'CHZ rewards earned from the Chiliz validators the pooled CHZ is delegated to.',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'Share of the validator rewards kept by the protocol and sent to the fee vault.',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: 'The whole fee cut reaches the protocol fee vault, none of it is shared out.',
  },
  SupplySideRevenue: {
    [METRIC.STAKING_REWARDS]: 'Share of the validator rewards left in the pool, raising the CHZ redeemable per stCHZ.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.CHILIZ],
  start: '2026-06-18',
  methodology,
  breakdownMethodology,
}

export default adapter;

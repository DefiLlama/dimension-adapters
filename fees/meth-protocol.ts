import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Docs: https://docs.mantle.xyz/meth/components/smart-contracts/staking-meth
// Staking contract calculates mETHToETH exchange rate based on totalControlled:
// https://etherscan.io/address/0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f
const stakingContract = "0xe3cBd06D7dadB3F4e6557bAb7EdD924CD1489E8f";

// mETH ERC20 token:
// https://etherscan.io/token/0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa
const mETHToken = "0xd5F7838F5C461fefF7FE49ea5ebaF7728bB0ADfa";

// ReturnsAggregator contract manages protocol fee basis points (default 1000 = 10%):
// https://etherscan.io/address/0x1766be66fBb0a1883d41B4cfB0a533c5249D3b82
const returnsAggregator = "0x1766be66fBb0a1883d41B4cfB0a533c5249D3b82";

const abi = {
  mETHToETH: "function mETHToETH(uint256) view returns (uint256)",
  feesBasisPoints: "uint16:feesBasisPoints",
};

const ONE_ETHER = 10n ** 18n;
const BPS_DENOMINATOR = 10000n;

/**
 * Accrual-based fee fetcher for mETH Protocol (Mantle LSP), adhering to DefiLlama LST guidelines:
 * - Computes total yield generated from exchange-rate growth (mETHToETH) scaled by share supply (mETH totalSupply).
 * - Because net returns compound into mETH after the protocol fee deduction (feesBasisPoints, 10%),
 *   the exchange rate growth represents the net supply-side reward (90%).
 * - Gross staking rewards (dailyFees) are grossed up: totalRewards = supplySideRewards * 10000 / (10000 - feesBasisPoints).
 * - Protocol revenue is the 10% fee: protocolRevenue = totalRewards - supplySideRewards.
 * - All calculations use exact BigInt arithmetic to eliminate floating-point truncation.
 */
async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [feesBasisPointsRaw, rateStartRaw, rateEndRaw, shareSupplyRaw] = await Promise.all([
    options.api.call({
      target: returnsAggregator,
      abi: abi.feesBasisPoints,
    }),
    options.fromApi.call({
      target: stakingContract,
      abi: abi.mETHToETH,
      params: [ONE_ETHER.toString()],
    }),
    options.api.call({
      target: stakingContract,
      abi: abi.mETHToETH,
      params: [ONE_ETHER.toString()],
    }),
    options.api.call({
      target: mETHToken,
      abi: "function totalSupply() view returns (uint256)",
    }),
  ]);

  const feesBasisPoints = BigInt(feesBasisPointsRaw);
  const rateStart = BigInt(rateStartRaw);
  const rateEnd = BigInt(rateEndRaw);
  const shareSupply = BigInt(shareSupplyRaw);

  const rateDelta = rateEnd - rateStart;
  if (rateDelta > 0n) {
    // Net yield distributed to mETH holders (supply-side revenue)
    const supplySideRewards = (shareSupply * rateDelta) / ONE_ETHER;
    // Gross up: supply-side represents (10000 - feesBasisPoints) of total staking yield
    const stakerBps = BPS_DENOMINATOR - feesBasisPoints;
    const totalRewards = (supplySideRewards * BPS_DENOMINATOR) / stakerBps;
    const protocolRevenue = totalRewards - supplySideRewards;

    dailyFees.addGasToken(totalRewards, METRIC.STAKING_REWARDS);
    dailyRevenue.addGasToken(protocolRevenue, METRIC.STAKING_REWARDS);
    dailySupplySideRevenue.addGasToken(supplySideRewards, METRIC.STAKING_REWARDS);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: 0,
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2023-10-07',
    },
  },
  methodology: {
    Fees: 'Total validator fees and rewards earned from staked ETH on consensus and execution layers.',
    Revenue: 'Protocol fee share of staking rewards allocated to the mETH Protocol Treasury based on on-chain fee basis points.',
    SupplySideRevenue: 'Net staking rewards distributed to mETH holders.',
    ProtocolRevenue: 'Protocol fee share of staking rewards allocated to the mETH Protocol Treasury based on on-chain fee basis points.',
    HoldersRevenue: 'No revenue share to COOK token holders.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.STAKING_REWARDS]: 'Total ETH rewards generated from staked ETH on consensus and execution layers.',
    },
    Revenue: {
      [METRIC.STAKING_REWARDS]: 'Protocol fee share of ETH staking rewards allocated to the treasury.',
    },
    ProtocolRevenue: {
      [METRIC.STAKING_REWARDS]: 'Protocol fee share of ETH staking rewards allocated to the treasury.',
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: 'Net ETH staking rewards distributed to mETH holders.',
    },
  },
};

export default adapter;

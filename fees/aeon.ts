import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// $aeon token: https://aeon.fun/transparency
// WETH/AEON Uniswap v4 pool on Base, launched via Bankr using the Doppler v4
// multicurve stack (DecayMulticurveInitializerHook). The pool charges a dynamic
// LP fee (1.2% steady-state, emitted per-swap in the Swap event) that accrues
// to protocol-owned multicurve positions and is split between on-chain
// beneficiaries — there are no third-party LPs.
//
// Beneficiary shares (DecayMulticurveInitializer 0xD59cE43E53D69F190E15d9822Fb4540dCcc91178,
// getShares(poolId, beneficiary)):
//   57%   Aeon (initially 0x3735...7A2b, later moved to the deployer wallet
//         0x6797...e3a2 which routes claimed fees to the treasury)
//   43%   launch platform beneficiaries (Bankr/Doppler & interface)
const UNIV4_POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const AEON_WETH_POOL_ID = '0x4a9b9e13975d26f4e3e17c655593bb82145dd4452aedafb826d856b817c9cfd4';
const WETH = '0x4200000000000000000000000000000000000006';

const MULTICURVE_INITIALIZER = '0xD59cE43E53D69F190E15d9822Fb4540dCcc91178';
// Aeon-controlled beneficiaries over the pool's lifetime — shares are summed,
// so the beneficiary handoff between them doesn't skew historical revenue
const AEON_BENEFICIARIES = [
  '0x373509C3d065aE6049D6FF4e225B9936455d7A2b',
  '0x67976cebb5266b50a08c0dcb676e03baf305e3a2', // deployer wallet
];

const SWAP_EVENT = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // treasury share of swap fees (WAD), read on-chain so beneficiary updates are reflected
  const shares = await options.api.multiCall({
    abi: 'function getShares(bytes32 poolId, address beneficiary) view returns (uint256 shares)',
    calls: AEON_BENEFICIARIES.map((beneficiary) => ({
      target: MULTICURVE_INITIALIZER,
      params: [AEON_WETH_POOL_ID, beneficiary],
    })),
  });
  const treasuryShare = shares.reduce((sum: number, s: any) => sum + Number(s), 0) / 1e18;

  const logs = await options.getLogs({
    target: UNIV4_POOL_MANAGER,
    eventAbi: SWAP_EVENT,
    // filter by indexed poolId (topic1) — only swaps on the AEON/WETH pool
    topics: [SWAP_TOPIC, AEON_WETH_POOL_ID],
  });

  for (const log of logs) {
    // currency0 is WETH — measure fees on the WETH side of each swap,
    // same approximation as the canonical uniswap-v4 adapter
    const amount0 = Math.abs(Number(log.amount0));
    const feeRate = Number(log.fee) / 1e6; // dynamic fee in ppm
    const fee = amount0 * feeRate;
    dailyFees.add(WETH, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(WETH, fee * treasuryShare, METRIC.SWAP_FEES);
    dailySupplySideRevenue.add(WETH, fee * (1 - treasuryShare), METRIC.SWAP_FEES);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-03-10',
  methodology: {
    Fees: 'Dynamic swap fee (1.2% steady-state) paid by users trading on the WETH/AEON Uniswap v4 pool on Base. Liquidity is protocol-owned multicurve positions — there are no third-party LPs.',
    Revenue: '57% of swap fees routed to the Aeon treasury, per the on-chain beneficiary split read from the multicurve initializer.',
    ProtocolRevenue: '57% of swap fees routed to the Aeon treasury.',
    SupplySideRevenue: '43% of swap fees going to the launch platform beneficiaries (Bankr/Doppler & interface), per the on-chain beneficiary split.',
    HoldersRevenue: 'Swap fees are not distributed to token holders directly; treasury buybacks are funded from non-trading revenue.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Dynamic swap fee charged on WETH/AEON Uniswap v4 pool swaps, measured on the WETH side of each swap.',
    },
    Revenue: {
      [METRIC.SWAP_FEES]: '57% treasury share of swap fees, per the on-chain beneficiary split.',
    },
    ProtocolRevenue: {
      [METRIC.SWAP_FEES]: '57% treasury share of swap fees, per the on-chain beneficiary split.',
    },
    SupplySideRevenue: {
      [METRIC.SWAP_FEES]: '43% launch platform share of swap fees (Bankr/Doppler & interface beneficiaries).',
    },
  },
};

export default adapter;

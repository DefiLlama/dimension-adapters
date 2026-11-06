import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

// $aeon token: https://www.aeon.fun/transparency
// WETH/AEON Uniswap v4 pool on Base, launched via Bankr using the Doppler v4
// multicurve stack (DecayMulticurveInitializerHook). The pool charges a dynamic
// LP fee (1.2% steady-state, emitted per-swap in the Swap event) that accrues
// to protocol-owned multicurve positions and is split between on-chain
// beneficiaries, there are no third-party LPs.
// Uniswap's v4 protocol fee is 0 on this pool (StateView.getSlot0 protocolFee = 0,
// checked 2026-11-03), so the full swap fee goes to the multicurve positions.
//
// Beneficiary shares (DecayMulticurveInitializer 0xD59cE43E53D69F190E15d9822Fb4540dCcc91178,
// getShares(poolId, beneficiary)):
//   57%   Aeon (initially 0x3735...7A2b, later moved to the deployer wallet
//         0x6797...e3a2 which routes claimed fees to the treasury)
//   43%   launch platform beneficiaries (Bankr/Doppler & interface)
const UNIV4_POOL_MANAGER = '0x498581ff718922c3f8e6a244956af099b2652b2b';
const AEON_WETH_POOL_ID = '0x4a9b9e13975d26f4e3e17c655593bb82145dd4452aedafb826d856b817c9cfd4';
const WETH = ADDRESSES.optimism.WETH_1;

const MULTICURVE_INITIALIZER = '0xD59cE43E53D69F190E15d9822Fb4540dCcc91178';
// Aeon-controlled beneficiaries over the pool's lifetime: shares are summed,
// so the beneficiary handoff between them doesn't skew historical revenue
const AEON_BENEFICIARIES = [
  '0x373509C3d065aE6049D6FF4e225B9936455d7A2b',
  '0x67976cebb5266b50a08c0dcb676e03baf305e3a2', // deployer wallet
];

// Aeon wallets (https://www.aeon.fun/transparency)
const AEON_TOKEN = '0xbf8e8f0e8866a7052f948c16508644347c57aba3';
const DEPLOYER_WALLET = '0x67976cebb5266b50a08c0dcb676e03baf305e3a2';
const TREASURY_SAFE = '0xf1e958db7d1e4c074377946018ad645db4fb158e'; // Safe 3-of-3
const AEON_WALLETS = [DEPLOYER_WALLET, TREASURY_SAFE];
// Dedicated wallet that only receives client payments for Aeon's paid
// security work (audits). Every USDC/USDT/WETH transfer into it is client
// revenue, except transfers from Aeon's own wallets.
const CLIENT_PAYMENTS_WALLET = '0xf0c0b943487a895bb2e889c4acb048f3422d5d62';
const CLIENT_PAYMENT_TOKENS = [ADDRESSES.base.USDC, ADDRESSES.base.USDT, WETH];

// $aeon arriving in the Aeon wallets from these addresses is not a buyback:
// fee claims from the multicurve initializer (already counted as swap fee
// revenue) and transfers between Aeon's own wallets / Safe owners.
const NOT_BUYBACK_SENDERS = new Set([
  MULTICURVE_INITIALIZER,
  ...AEON_BENEFICIARIES,
  ...AEON_WALLETS,
  CLIENT_PAYMENTS_WALLET,
  '0x7e0512f8089886003798cdeb60c898b145634bd3', // Safe owner
  '0x0000ce08fa224696a819877070bf378e8b131acf', // Safe owner
  '0xc436834cefcb1bae4dc2988ffc0043beafb61133', // Safe owner
].map((a) => a.toLowerCase()));

const SWAP_EVENT = 'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';
const SWAP_TOPIC = '0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f';

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // treasury share of swap fees (WAD), read on-chain so beneficiary updates are reflected
  const shares = await options.api.multiCall({
    abi: 'function getShares(bytes32 poolId, address beneficiary) view returns (uint256 shares)',
    calls: AEON_BENEFICIARIES.map((beneficiary) => ({
      target: MULTICURVE_INITIALIZER,
      params: [AEON_WETH_POOL_ID, beneficiary],
    })),
  });
  const treasuryShareWad = shares.reduce((sum: bigint, s: any) => sum + BigInt(s), 0n);

  const logs = await options.getLogs({
    target: UNIV4_POOL_MANAGER,
    eventAbi: SWAP_EVENT,
    // filter by indexed poolId (topic1): only swaps on the AEON/WETH pool
    topics: [SWAP_TOPIC, AEON_WETH_POOL_ID],
  });

  for (const log of logs) {
    // currency0 is WETH: measure fees on the WETH side of each swap,
    // same approximation as the canonical uniswap-v4 adapter.
    // BigInt math so large swaps keep full precision.
    const amount0 = BigInt(log.amount0);
    const absAmount0 = amount0 < 0n ? -amount0 : amount0;
    const fee = (absAmount0 * BigInt(log.fee)) / 1_000_000n; // dynamic fee in ppm
    const treasuryFee = (fee * treasuryShareWad) / 10n ** 18n;
    dailyFees.add(WETH, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(WETH, treasuryFee, "Token Swap Fees to Treasury");
    dailySupplySideRevenue.add(WETH, fee - treasuryFee, "Token Swap Fees to Launch Platform");
  }

  // client payments for paid security work, received by the dedicated wallet
  const clientPayments = await addTokensReceived({
    options,
    target: CLIENT_PAYMENTS_WALLET,
    tokens: CLIENT_PAYMENT_TOKENS,
    logFilter: (log: any) => !NOT_BUYBACK_SENDERS.has(String(log.from).toLowerCase()),
  });
  dailyFees.addBalances(clientPayments, "Security Audit Fees");
  dailyRevenue.addBalances(clientPayments, "Security Audit Fees To Treasury");

  // market buybacks: $aeon bought by the Aeon wallets through swap routers,
  // e.g. tx 0x6dfd84eb5e57240f7cb03026f7c96def9135c5f1574074ad2d686d576eb1bb04 (500 USDC in)
  const buybacks = await addTokensReceived({
    options,
    targets: AEON_WALLETS,
    token: AEON_TOKEN,
    logFilter: (log: any) => !NOT_BUYBACK_SENDERS.has(String(log.from).toLowerCase()),
  });
  dailyHoldersRevenue.addBalances(buybacks, "Token Buy Back");

  // buybacks are paid out of treasury income, so ProtocolRevenue = Revenue - HoldersRevenue
  const dailyProtocolRevenue = dailyRevenue.clone();
  dailyProtocolRevenue.subtract(dailyHoldersRevenue, "Token Swap Fees to Treasury");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: '2026-03-10',
  // protocol revenue goes negative in a window where a buyback is larger than that window's income
  allowNegativeValue: true,
  methodology: {
    Fees: 'Dynamic swap fee (1.2% steady-state) paid by users trading on the WETH/AEON Uniswap v4 pool on Base, plus client payments for paid security work received by the dedicated Aeon client payments wallet. Liquidity is protocol-owned multicurve positions, there are no third-party LPs.',
    Revenue: '57% of swap fees routed to the Aeon treasury, per the on-chain beneficiary split read from the multicurve initializer, plus all client payments for security work.',
    ProtocolRevenue: '57% of swap fees plus client payments for security work kept by Aeon, minus what the treasury spends on $aeon buybacks.',
    SupplySideRevenue: '43% of swap fees going to the launch platform beneficiaries (Bankr/Doppler & interface), per the on-chain beneficiary split.',
    HoldersRevenue: '$aeon bought back on the market by the Aeon wallets (deployer wallet and treasury Safe) and kept by the treasury.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: 'Dynamic swap fee charged on WETH/AEON Uniswap v4 pool swaps, measured on the WETH side of each swap.',
      "Security Audit Fees": 'USDC, USDT or WETH paid by clients for security audits to the dedicated Aeon client payments wallet.',
    },
    Revenue: {
      "Token Swap Fees to Treasury": '57% treasury share of swap fees, per the on-chain beneficiary split.',
      "Security Audit Fees To Treasury": 'Client payments for security audits, kept in full by Aeon.',
    },
    ProtocolRevenue: {
      "Token Swap Fees to Treasury": '57% treasury share of swap fees, per the on-chain beneficiary split, minus $aeon buybacks.',
      "Security Audit Fees To Treasury": 'Client payments for security audits, kept in full by Aeon.',
    },
    SupplySideRevenue: {
      "Token Swap Fees to Launch Platform": '43% launch platform share of swap fees (Bankr/Doppler & interface beneficiaries).',
    },
    HoldersRevenue: {
      "Token Buy Back": '$aeon bought on the market by the Aeon wallets through swap routers.',
    },
  },
  doublecounted: true, // uniswap
};

export default adapter;

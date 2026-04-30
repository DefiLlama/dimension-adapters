import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * Tempo Fee AMM — daily fees + revenue.
 *
 * The Fee Manager is a precompile predeployed at a fixed address on every
 * Tempo node. It hosts the Fee AMM, an LP-backed constant-product market that
 * auto-converts a user's chosen TIP-20 fee token into the validator's
 * preferred TIP-20. Liquidity providers earn a flat 0.25% on every swap; the
 * protocol does not retain any cut.
 *
 *   Source:    https://github.com/tempoxyz/tempo/tree/main/crates/precompiles/src/tip_fee_manager
 *   Spec:      https://docs.tempo.xyz/protocol/fees/spec-fee-amm
 *   Predeploy: https://docs.tempo.xyz/quickstart/predeployed-contracts
 *
 * METHODOLOGY
 *
 * Each fee swap emits:
 *
 *   event RebalanceSwap(
 *     address indexed userToken,
 *     address indexed validatorToken,
 *     address indexed swapper,
 *     uint256 amountIn,
 *     uint256 amountOut
 *   );
 *
 * Per the Rust constants in `crates/precompiles/src/tip_fee_manager/mod.rs`,
 * the swap fee is a fixed 25 bps (`FEE_BPS = 25`, `BASIS_POINTS = 10_000`).
 * So per swap: fee = amountIn * 25 / 10_000 (in userToken units).
 *
 * 100% of the fee accrues to LPs; protocol revenue and holders revenue are
 * both zero.
 */

const FEE_MANAGER = '0xfeec000000000000000000000000000000000000';

const eventRebalanceSwap =
  'event RebalanceSwap(address indexed userToken, address indexed validatorToken, address indexed swapper, uint256 amountIn, uint256 amountOut)';

const FEE_BPS = 25n;
const BASIS_POINTS = 10000n;

const methodology = {
  Fees: "Sum of 0.25% LP fees on every Tempo Fee AMM RebalanceSwap. Fees are denominated in the userToken (the TIP-20 the swapper paid in). All TIP-20s on Tempo's official Token List Registry have a coingeckoId, so the pricing layer resolves USD value automatically.",
  Revenue: "Equals fees — 100% of the 0.25% fee accrues to liquidity providers; the protocol does not retain any cut.",
  SupplySideRevenue: "100% of the 0.25% fee goes to LPs.",
  ProtocolRevenue: "Zero — Tempo does not take a cut of Fee AMM swap fees.",
  HoldersRevenue: "Zero — there is no holder buyback or distribution mechanism on the Fee AMM.",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const swaps = await options.getLogs({
    target: FEE_MANAGER,
    eventAbi: eventRebalanceSwap,
  });

  for (const log of swaps) {
    // fee = amountIn * 25 / 10000 (0.25% in userToken's smallest unit)
    const fee = (BigInt(log.amountIn) * FEE_BPS) / BASIS_POINTS;
    dailyFees.add(log.userToken, fee);
    dailyRevenue.add(log.userToken, fee);
    dailySupplySideRevenue.add(log.userToken, fee);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.TEMPO]: {
      fetch,
      start: '2026-03-18', // Tempo Mainnet "Presto" launch (chainId 4217)
    },
  },
};

export default adapter;

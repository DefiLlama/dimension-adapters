import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// StochasticOptions V2 (SFOptionsV2) on Base mainnet. Deployed 2026-09-13 at block
// 51260103 per SFDapp/utils/contracts_config.py:MainnetBase (supersedes two earlier
// 2026-08 and 2026-09-08 deployments that are now obsolete).
const STOCHASTIC_OPTIONS = "0x473b5c9f831Af8cB5B379eB3Ab8f9806E9A0470C";
// SFSwapV0 factory — the only address that emits PairCreated and the canonical
// registry of every trading pair on the protocol. SFDapp/utils/contracts_config.py.
const SFSWAPV0_FACTORY = "0xcE23F95A0aC4B28B4eb2D7697aBD3c87EE03fc90";
// USDC on Base. This is `stableCoin` in every pair (token0); token1 is the
// ERC-1155 leg wrapped by the pair.
const USDC = ADDRESSES.base.USDC; // 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
// SFOptionsV2 deploys at block 51260103 (Sep 13, 14:25 UTC). Every existing
// PairCreated event predates it because pairs are created by mint+sell flows that
// already needed SFOptions. Using the SFOptions block as the discovery lower bound
// keeps the PairCreated scan bounded without a hardcoded factory-deploy block.
const FACTORY_DISCOVERY_FROM_BLOCK = 51260103;

// SFOptions.sol line 123-128. `amount` is USDC collateral committed by the writer and
// the number of option units minted on each leg ("1 USDC = 1 option unit" per README).
const OPTION_ISSUED_EVENT =
  "event optionIssued(address indexed issuer, uint256 indexed tokenId, uint256 indexed invertedTokenId, uint256 amount)";

// SFOptions.sol line 188-196. `fee` is the settlement fee paid to feeCollector_address.
const OPTION_EXERCISED_EVENT =
  "event OptionExercised(address indexed exerciser, uint256 indexed tokenId, uint256 value, uint256 executionPrice, uint256 share, uint256 holderPayoff, uint256 fee)";

// SFOptions.sol line 208-215. `fee` is the matched-pair close fee paid to feeCollector_address.
const POSITION_CLOSED_EVENT =
  "event PositionClosed(address indexed holder, uint256 indexed tokenId, uint256 indexed invertedTokenId, uint256 value, uint256 holderAmount, uint256 fee)";

// SFSwapV0Factory.sol line 20-25. The factory address is the same on every chain
// (deployed via deterministic CREATE2 from pairImplementation). `pair` (non-indexed,
// second data word) is the SFSwapV0Pair contract address.
const PAIR_CREATED_EVENT =
  "event PairCreated(address indexed tradeToken, uint256 indexed tokenId, address pair, uint256 pairIndex)";

// ISFSwapV0Pair.sol line 14-21. Uniswap-V2-style swap accounting:
//   amount0In / amount1In    — tokens paid in by the trader
//   amount0Out / amount1Out  — tokens received by the trader
//   token0 = USDC (stableCoin), token1 = tradeToken (the ERC-1155 leg)
// A "buyer paid premium" swap has `amount0In > 0` (USDC came in) and the tradeToken
// went out. The reverse direction is a writer unwinding — same dollar counted twice
// if summed as a separate "premium inflow" event.
const SWAP_EVENT =
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)";

const EXERCISE_FEE_LABEL = "Option Exercise Fee";
const CLOSE_FEE_LABEL = "Option Close Fee";

const fetch = async (options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // 1. Discover every SFSwapV0Pair address. Pair creation is a one-time event per
  // (tradeToken, tokenId) tuple, so re-scanning `PairCreated` every window is cheap
  // while pair counts stay small. If pair counts grow into the thousands, swap this
  // to `cacheInCloud: true` (the documented use-case for cloud cache).
  const pairCreatedLogs = await options.getLogs({
    target: SFSWAPV0_FACTORY,
    eventAbi: PAIR_CREATED_EVENT,
    fromBlock: FACTORY_DISCOVERY_FROM_BLOCK,
  });
  const pairAddresses: string[] = pairCreatedLogs.map((l: any) => l.pair);

  // 2. Premium volume = USDC paid by option buyers. One multi-target getLogs call
  // for all pairs keeps the RPC cost flat as pairs are added.
  if (pairAddresses.length > 0) {
    const swapLogs = await options.getLogs({
      targets: pairAddresses,
      eventAbi: SWAP_EVENT,
    });
    let usdcIn = 0n;
    for (const log of swapLogs) {
      if (log.amount0In > 0n) {
        usdcIn += log.amount0In;
      }
    }
    dailyPremiumVolume.add(USDC, usdcIn);
  }

  // 3. Notional volume = writer's USDC collateral committed at option issuance.
  // Following the Prodigy/Dopex/Rysk convention of raw token amount (no oracle
  // multiplication): the protocol has no on-chain pricefeed accessible to the
  // adapter, and `1 USDC = 1 option unit` per protocol design means the committed
  // USDC IS the unit count of options minted.
  const issuedLogs = await options.getLogs({
    target: STOCHASTIC_OPTIONS,
    eventAbi: OPTION_ISSUED_EVENT,
  });
  for (const log of issuedLogs) {
    dailyNotionalVolume.add(USDC, log.amount);
  }

  // 4. Fees: settlement + matched-pair close fees, both routed to feeCollector_address.
  const exercisedLogs = await options.getLogs({
    target: STOCHASTIC_OPTIONS,
    eventAbi: OPTION_EXERCISED_EVENT,
  });
  for (const log of exercisedLogs) {
    dailyFees.add(USDC, log.fee, EXERCISE_FEE_LABEL);
  }

  const closedLogs = await options.getLogs({
    target: STOCHASTIC_OPTIONS,
    eventAbi: POSITION_CLOSED_EVENT,
  });
  for (const log of closedLogs) {
    dailyFees.add(USDC, log.fee, CLOSE_FEE_LABEL);
  }

  // Revenue = Fees: the protocol has no governance token and every fee is the
  // amount actually transferred to feeCollector_address (SFOptions.sol lines 1030
  // and 1133), so the recipient rotation does not change the totals — no api.call
  // to read feeCollector_address is needed.
  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(),
  };
};

const methodology = {
  NotionalVolume:
    "Sum of `amount` from each `optionIssued` event on StochasticOptions: USDC collateral committed by writers when minting a paired (long + short) position. Following the Prodigy/Dopex/Rysk convention of counting raw token amount (no oracle multiplication), this is the unit count of options minted — `1 USDC = 1 option unit` per protocol design.",
  PremiumVolume:
    "Sum of USDC paid by option buyers on SFSwapV0Pair AMM pools, direction USDC→tradeToken only (the `amount0In` field of each `Swap` event). The reverse direction (tradeToken→USDC) is a writer unwinding their previously-sold leg and does not count as new premium inflow. Pair addresses are discovered from `PairCreated` events on the factory (cloud-cached, since pair creation is a one-time event per (token, tokenId) tuple).",
  Fees:
    "Sum of `fee` fields from `OptionExercised` (settlement fee on each exercised leg) and `PositionClosed` (matched-pair close fee). Both are charged at `1 / sf_fee_divisor` of the exercised/closed collateral and paid in USDC.",
  Revenue:
    "Equal to Fees: the protocol has no governance token, and every fee is transferred to the on-chain `feeCollector_address` (which the owner can rotate via `setFeeCollector` / `FeeCollectorChanged`).",
};

const breakdownMethodology = {
  Fees: {
    [EXERCISE_FEE_LABEL]:
      "Settlement fee on each leg exercised via `OptionExercised`. Computed as `1 / sf_fee_divisor` of the collateral burned and transferred to `feeCollector_address`.",
    [CLOSE_FEE_LABEL]:
      "Matched-pair close fee on each leg unwound via `PositionClosed`. Same rate as the exercise fee (so this is not a cheaper substitute for `exercise`) and transferred to `feeCollector_address`.",
  },
  Revenue: {
    [EXERCISE_FEE_LABEL]:
      "Exercise settlement fees routed to the on-chain `feeCollector_address`.",
    [CLOSE_FEE_LABEL]:
      "Matched-pair close fees routed to the on-chain `feeCollector_address`.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BASE],
  start: "2026-09-13",
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;

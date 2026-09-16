import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

// StochasticOptions V2 (SFOptionsV2) on Base mainnet. Deployed 2026-09-13 at block
// 51260103 per SFDapp/utils/contracts_config.py:MainnetBase (supersedes two earlier
// 2026-08 and 2026-09-08 deployments that are now obsolete).
const STOCHASTIC_OPTIONS = "0x473b5c9f831Af8cB5B379eB3Ab8f9806E9A0470C";
const USDC = ADDRESSES.base.USDC; // 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

// SFOptions.sol line 123-128. `amount` is USDC collateral committed by the writer and
// the number of option units minted on each leg ("1 USDC = 1 option unit" per README).
const OPTION_ISSUED_EVENT =
  "event optionIssued(address indexed issuer, uint256 tokenId, uint256 invertedTokenId, uint256 amount)";

// SFOptions.sol line 188-196. `fee` is the settlement fee paid to feeCollector_address.
const OPTION_EXERCISED_EVENT =
  "event OptionExercised(address indexed exerciser, uint256 indexed tokenId, uint256 value, uint256 executionPrice, uint256 share, uint256 holderPayoff, uint256 fee)";

// SFOptions.sol line 208-215. `fee` is the matched-pair close fee paid to feeCollector_address.
const POSITION_CLOSED_EVENT =
  "event PositionClosed(address indexed holder, uint256 indexed tokenId, uint256 indexed invertedTokenId, uint256 value, uint256 holderAmount, uint256 fee)";

const EXERCISE_FEE_LABEL = "Option Exercise Fee";
const CLOSE_FEE_LABEL = "Option Close Fee";

const fetch = async (options: FetchOptions) => {
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const issuedLogs = await options.getLogs({
    target: STOCHASTIC_OPTIONS,
    eventAbi: OPTION_ISSUED_EVENT,
  });
  for (const log of issuedLogs) {
    dailyPremiumVolume.add(USDC, log.amount);
  }

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

  // Premium == notional by protocol design (1 USDC = 1 option unit), and revenue == fees
  // because the protocol has no token and every fee routes to feeCollector_address. The
  // `fee` field in OptionExercised / PositionClosed is the amount transferred to
  // feeCollector_address (SFOptions.sol lines 1030 and 1133), so the recipient rotation
  // does not affect the totals — no api.call needed to read feeCollector_address.
  return {
    dailyPremiumVolume,
    dailyNotionalVolume: dailyPremiumVolume,
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const methodology = {
  PremiumVolume:
    "Sum of `amount` from each `optionIssued` event: USDC collateral committed by writers on the StochasticOptions contract. The protocol prices options collateral-denominated (1 USDC = 1 option unit), so this collateral is also the premium-equivalent per option unit.",
  NotionalVolume:
    "Equal to PremiumVolume by protocol design (1 USDC = 1 option unit): the USDC collateral committed at issuance equals the notional exposure of the options minted. AMM trade volume on SFSwapV0Pair is tracked separately by the AMM adapter and is not counted here.",
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

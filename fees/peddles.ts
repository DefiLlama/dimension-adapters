import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { PEDDLES } from "../helpers/peddles";

// Peddles: a token launchpad on Uniswap v4. Every launch pool carries PeddlesFeeHook, which charges
// each swap in the pool's quote asset (ETH, or the tokenised stock the launch is paired against) and
// splits the charge at that moment between the protocol, the token's creator and the token's holders.
//
// Everything is read from events, and each amount is added against the asset it was charged in.
//
// Not counted, on purpose:
//   - PlatformSwept / CreatorSwept / HoldersSwept on the hook: they move money already counted when
//     it accrued.
//   - The two Peddles swap routers: they charge nothing on a pool that has the hook, and every
//     launch pool has it.

const FEE_ACCRUED =
  "event FeeAccrued(bytes32 indexed poolId, address indexed quote, uint256 platform, uint256 creator, uint256 holders, bool viaBefore)";
// Charged instead of FeeAccrued during the first minutes after a launch.
const SNIPER_FEE_ACCRUED =
  "event SniperFeeAccrued(bytes32 indexed poolId, address indexed quote, uint256 toLiquidity, uint256 toCreator, uint256 toPlatform, bool viaBefore)";
// Paid in the chain's native currency by whoever creates a launch.
const LAUNCH_FEE_PAID = "event LaunchFeePaid(address indexed creator, uint256 amount)";
// Paid in the chain's native currency, in the same transaction as the swap it is charged on.
const FORWARDER_FEE_COLLECTED =
  "event FeeCollected(address indexed payer, address indexed token, address indexed recipient, uint256 amount, uint16 feeBps)";

const SWAP_FEES = "Token Swap Fees";
const OPENING_TAX = "Opening Tax";
const LAUNCH_FEES = "Launch Fees";
const TERMINAL_FEES = "Terminal And Bot Fees";

const SWAP_FEES_TO_PROTOCOL = "Token Swap Fees To Protocol";
const SWAP_FEES_TO_CREATORS = "Token Swap Fees To Creators";
const SWAP_FEES_TO_TOKEN_HOLDERS = "Token Swap Fees To Token Holders";
const OPENING_TAX_TO_PROTOCOL = "Opening Tax To Protocol";
const OPENING_TAX_TO_CREATORS = "Opening Tax To Creators";
const OPENING_TAX_TO_LIQUIDITY = "Opening Tax To Liquidity";
const LAUNCH_FEES_TO_PROTOCOL = "Launch Fees To Protocol";
const TERMINAL_FEES_TO_PROTOCOL = "Terminal And Bot Fees To Protocol";

const fetch = async (options: FetchOptions) => {
  const deployment = PEDDLES[options.chain];

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const accrued = await options.getLogs({ target: deployment.feeHook, eventAbi: FEE_ACCRUED });
  for (const log of accrued) {
    dailyFees.add(log.quote, log.platform, SWAP_FEES);
    dailyFees.add(log.quote, log.creator, SWAP_FEES);
    dailyFees.add(log.quote, log.holders, SWAP_FEES);
    dailyRevenue.add(log.quote, log.platform, SWAP_FEES_TO_PROTOCOL);
    dailySupplySideRevenue.add(log.quote, log.creator, SWAP_FEES_TO_CREATORS);
    // Holders of the LAUNCHED token, paid in the pool's quote asset. They are not holders of a
    // Peddles token, so this is a cost of revenue and not holders revenue.
    dailySupplySideRevenue.add(log.quote, log.holders, SWAP_FEES_TO_TOKEN_HOLDERS);
  }

  const opening = await options.getLogs({ target: deployment.feeHook, eventAbi: SNIPER_FEE_ACCRUED });
  for (const log of opening) {
    dailyFees.add(log.quote, log.toPlatform, OPENING_TAX);
    dailyFees.add(log.quote, log.toCreator, OPENING_TAX);
    dailyFees.add(log.quote, log.toLiquidity, OPENING_TAX);
    dailyRevenue.add(log.quote, log.toPlatform, OPENING_TAX_TO_PROTOCOL);
    dailySupplySideRevenue.add(log.quote, log.toCreator, OPENING_TAX_TO_CREATORS);
    dailySupplySideRevenue.add(log.quote, log.toLiquidity, OPENING_TAX_TO_LIQUIDITY);
  }

  const launchFees = await options.getLogs({
    targets: deployment.launchFeeCollectors,
    eventAbi: LAUNCH_FEE_PAID,
    flatten: true,
  });
  for (const log of launchFees) {
    dailyFees.addGasToken(log.amount, LAUNCH_FEES);
    dailyRevenue.addGasToken(log.amount, LAUNCH_FEES_TO_PROTOCOL);
  }

  const forwarded = await options.getLogs({ target: deployment.feeForwarder, eventAbi: FORWARDER_FEE_COLLECTED });
  for (const log of forwarded) {
    dailyFees.addGasToken(log.amount, TERMINAL_FEES);
    dailyRevenue.addGasToken(log.amount, TERMINAL_FEES_TO_PROTOCOL);
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Everything users pay: the fee charged on each swap of a launched token, the higher fee charged in the first minutes after a launch, the fee to create a launch, and the fee the Peddles Terminal and trade bot add to a swap.",
  Revenue: "The protocol's share of each swap fee and of the opening fee, plus all launch fees and all Terminal and trade bot fees.",
  ProtocolRevenue: "The protocol's share of each swap fee and of the opening fee, plus all launch fees and all Terminal and trade bot fees.",
  SupplySideRevenue: "The share of each swap fee paid to the token's creator and to the token's own holders, and the part of the opening fee returned to the pool as liquidity.",
};

const breakdownMethodology = {
  Fees: {
    [SWAP_FEES]: "The fee charged on every swap of a launched token, in the asset the pool is paired against.",
    [OPENING_TAX]: "The higher fee charged on swaps in the first minutes after a launch.",
    [LAUNCH_FEES]: "The fee paid to create a launch, in the chain's native currency.",
    [TERMINAL_FEES]: "The fee the Peddles Terminal and trade bot add to a swap, in the chain's native currency.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's share of each swap fee.",
    [OPENING_TAX_TO_PROTOCOL]: "The protocol's share of the opening fee.",
    [LAUNCH_FEES_TO_PROTOCOL]: "All launch fees.",
    [TERMINAL_FEES_TO_PROTOCOL]: "All Terminal and trade bot fees.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "The protocol's share of each swap fee.",
    [OPENING_TAX_TO_PROTOCOL]: "The protocol's share of the opening fee.",
    [LAUNCH_FEES_TO_PROTOCOL]: "All launch fees.",
    [TERMINAL_FEES_TO_PROTOCOL]: "All Terminal and trade bot fees.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_CREATORS]: "The share of each swap fee paid to the token's creator.",
    [SWAP_FEES_TO_TOKEN_HOLDERS]: "The share of each swap fee paid to holders of the launched token.",
    [OPENING_TAX_TO_CREATORS]: "The share of the opening fee paid to the token's creator.",
    [OPENING_TAX_TO_LIQUIDITY]: "The share of the opening fee returned to the pool as liquidity.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: PEDDLES,
  methodology,
  breakdownMethodology,
};

export default adapter;

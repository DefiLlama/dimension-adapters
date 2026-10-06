import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

/**
 * Titan Locker - token, LP, Uniswap V3/V4 position and vesting locker on Robinhood Chain.
 *
 * Website: https://titandeployer.com/locker
 * Twitter: https://x.com/TitanDeployer
 * Contracts: https://github.com/titan-ecosystem/Titan-Locker-Contracts
 *
 * Every new lock pays a creation fee to the manager's fee receiver, either a flat
 * ETH fee (the whole deposit gets locked) or, for ERC-20 and vesting locks, a share
 * of the deposited token. Each payment emits FeeCollected(id, paidInEth, amount) on
 * the manager. A token fee does not name its token, so the token is read from the
 * TokenLockerCreated / VestingLockerCreated event the manager emits for the same lock id.
 *
 * Fee-exempt creators (such as Titan.fun launch locks through the vault manager) pay
 * nothing. All fees go to Titan's fee receiver and nothing is shared, so
 * fees == revenue == protocol revenue.
 */

// Lock managers, see the deployment table in the contracts repo above
const MANAGERS = [
  "0x713E56CeE7060F01F710bF26Aff988264dcfb311", // V1
  "0x26b0654a0756dcd036d4e7215324f3d2be34d79e", // V2
  "0x102a70bDA2C833b3483A2eE55C14c7ea0fb7A01B", // V2.1
  "0x4E907349FA31f9e42F0bf0E2E2fd09e6E1E2dB9d", // V2.1 vault (Titan.fun launch locks)
];

const FEE_COLLECTED = "event FeeCollected(uint40 indexed id, bool paidInEth, uint256 amount)";
const TOKEN_LOCKER_CREATED =
  "event TokenLockerCreated(uint40 id, address indexed token, address indexed token0, address indexed token1, address createdBy, uint256 balance, uint40 unlockTime)";
const VESTING_LOCKER_CREATED =
  "event VestingLockerCreated(uint40 id, address indexed token, address indexed token0, address indexed token1, address createdBy, uint256 amount, uint40 start, uint40 cliff, uint40 end)";

const LABELS = {
  ETH_FEES: "Lock Creation Fees Paid In ETH",
  TOKEN_FEES: "Lock Creation Fees Paid In Tokens",
};

const lockKey = (manager: string, id: any) => `${manager.toLowerCase()}-${id}`;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const [feeLogs, tokenLockLogs, vestingLockLogs] = await Promise.all([
    options.getLogs({ targets: MANAGERS, eventAbi: FEE_COLLECTED, onlyArgs: false, flatten: true }),
    options.getLogs({ targets: MANAGERS, eventAbi: TOKEN_LOCKER_CREATED, onlyArgs: false, flatten: true }),
    options.getLogs({ targets: MANAGERS, eventAbi: VESTING_LOCKER_CREATED, onlyArgs: false, flatten: true }),
  ]);

  // The creation event is emitted in the same transaction as its FeeCollected, so it is in the same window
  const lockToken: Record<string, string> = {};
  for (const log of [...tokenLockLogs, ...vestingLockLogs]) lockToken[lockKey(log.address, log.args.id)] = log.args.token;

  for (const log of feeLogs) {
    const { id, paidInEth, amount } = log.args;
    if (paidInEth) {
      dailyFees.addGasToken(amount, LABELS.ETH_FEES);
      continue;
    }
    const token = lockToken[lockKey(log.address, id)];
    if (!token) throw new Error(`Titan Locker: no creation event for token fee on lock ${lockKey(log.address, id)}`);
    dailyFees.add(token, amount, LABELS.TOKEN_FEES);
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailySupplySideRevenue: 0,
    dailyHoldersRevenue: 0,
  };
};

const methodology = {
  Fees: "Lock creation fees paid by users to Titan Locker, read from FeeCollected events on every lock manager: a flat ETH fee, or a share of the deposited token for ERC-20 and vesting locks.",
  Revenue: "All lock creation fees go to the Titan Locker fee receiver.",
  ProtocolRevenue: "All lock creation fees go to the Titan Locker fee receiver.",
  SupplySideRevenue: "No fees are shared with liquidity providers or other parties.",
  HoldersRevenue: "Titan Locker has no token, so no fees go to token holders.",
};

const breakdownMethodology = {
  Fees: {
    [LABELS.ETH_FEES]: "Flat ETH fee paid when creating a lock, in which case the whole deposit is locked.",
    [LABELS.TOKEN_FEES]: "Share of the deposited token taken as the fee when an ERC-20 or vesting lock is created without paying ETH.",
  },
  Revenue: {
    [LABELS.ETH_FEES]: "ETH lock creation fees sent to the Titan Locker fee receiver.",
    [LABELS.TOKEN_FEES]: "Token lock creation fees sent to the Titan Locker fee receiver.",
  },
  ProtocolRevenue: {
    [LABELS.ETH_FEES]: "ETH lock creation fees sent to the Titan Locker fee receiver.",
    [LABELS.TOKEN_FEES]: "Token lock creation fees sent to the Titan Locker fee receiver.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-04", // first lock created on the V1 manager
  methodology,
  breakdownMethodology,
};

export default adapter;

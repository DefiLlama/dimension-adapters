// Quiver — fees & revenue adapter (dimension-adapters).
//
// Quiver is a non-custodial token launchpad on Robinhood Chain (chainId 4663).
// It deploys fixed-supply ERC20s into Uniswap pools and permanently locks the
// initial LP in Quiver lockers. There is NO native launch / creation fee:
// optional msg.value on deployToken is a same-tx "dev buy" through SwapRouter02
// (liquidity principal + a swap), not protocol revenue.
//
// Fee source (the only user-paid fee Quiver routes):
//   Uniswap pool swap fees (1% tier on v3; v4 hook pools historically) that
//   accrue to Quiver-locked LP positions. When collectRewards runs, those fees
//   are split across configured reward recipients (creator vs protocol).
//
// Contracts (Robinhood Chain):
//   factoryV3 (active):     0xaA8Af274bba2b9dE53119CB117C8AC6A39e6F5Aa  block 10113641 (2026-07-15)
//                           documented as FACTORY_V3 / FACTORY_V3_DEPLOY_BLOCK (no runtime eth_call)
//   lpLockerV3:             0x38daBB90C96eea7B90613ABbf019ABCe0808CF12  block 10113611
//   factory (legacy v4):    0x3eDDD33805652c933a981F59055ef561660c54D2  block 9787616  (2026-07-14)
//   lpLocker (legacy v4):   0x11e0B26508788ABbc6e1F2df8A86C4F10b897a98  block 9787616
//   feeLocker (v4 claims):  0xd1B13382fDa3E165658F1d3502d6616A31B62491  block 9787616
//   teamFeeRecipient:       0x9748D3fe02890f155489dc4F76e413Bdcd97AE5a
//
// Events counted:
//   V3 — QuiverLpLockerV3.RewardsCollected(token, amount0, amount1, currency0, currency1)
//        Split with locker.tokenRewards(token).recipients / rewardBps (immutable per token;
//        currently 50/50 creator / teamFeeRecipient via factory.protocolBps = 5000).
//   V4 — QuiverFeeLocker.StoreTokens(depositor, feeOwner, token, balance, amount)
//        only when depositor == lpLocker v4 (filters out unrelated feeLocker deposits).
//        amount is the exact share credited to feeOwner after ClaimedRewards.
//
// Explicitly excluded:
//   - Gas
//   - Token supply / LP principal deposited at launch
//   - Optional launch-tx msg.value (dev buy, not a Quiver fee)
//   - Ordinary Uniswap trading volume (no dailyVolume)
//   - feeLocker.ClaimTokens (withdrawals of already-counted StoreTokens balances)
//   - QuiverRushDistributor deposits (reward-program funding, not user fees)
//
// doublecounted: true — these LP fees originate as Uniswap pool fees and may
// also appear under Uniswap if that adapter covers Robinhood pools.
//
//-----------------------------------------------------------------------------------------------------
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const FACTORY_V3 = "0xaA8Af274bba2b9dE53119CB117C8AC6A39e6F5Aa"; // https://robinhoodchain.blockscout.com/address/0xaA8Af274bba2b9dE53119CB117C8AC6A39e6F5Aa
const FACTORY_V3_DEPLOY_BLOCK = 10113641; // https://robinhoodchain.blockscout.com/block/10113641
const LP_LOCKER_V3 = "0x38daBB90C96eea7B90613ABbf019ABCe0808CF12"; // https://robinhoodchain.blockscout.com/address/0x38daBB90C96eea7B90613ABbf019ABCe0808CF12
const LP_LOCKER_V4 = "0x11e0B26508788ABbc6e1F2df8A86C4F10b897a98"; // https://robinhoodchain.blockscout.com/address/0x11e0B26508788ABbc6e1F2df8A86C4F10b897a98
const FEE_LOCKER = "0xd1B13382fDa3E165658F1d3502d6616A31B62491"; // https://robinhoodchain.blockscout.com/address/0xd1B13382fDa3E165658F1d3502d6616A31B62491
// Verified factory.teamFeeRecipient / owner EOA. Hardcoded (no historical eth_call)
// because Robinhood public RPC often lacks archive state ("missing trie node") and
// this address has not rotated. Update this constant if setTeamFeeRecipient changes it.
const PROTOCOL_RECIPIENT = "0x9748D3fe02890f155489dc4F76e413Bdcd97AE5a";

const BPS = 10_000n;

const REWARDS_COLLECTED =
  "event RewardsCollected(address indexed token, uint256 amount0, uint256 amount1, address currency0, address currency1)";
const STORE_TOKENS =
  "event StoreTokens(address indexed depositor, address indexed feeOwner, address indexed token, uint256 balance, uint256 amount)";
const TOKEN_REWARDS_V3 =
  "function tokenRewards(address token) view returns (address pool, (int24 tickLower, int24 tickUpper)[] positions, address[] recipients, uint16[] rewardBps)";

const isProtocolRecipient = (addr: string) =>
  addr.toLowerCase() === PROTOCOL_RECIPIENT.toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // --- Legacy Uniswap v4 path: fee shares stored by lpLocker into feeLocker ---
  const storeLogs = await options.getLogs({
    target: FEE_LOCKER,
    eventAbi: STORE_TOKENS,
  });

  for (const log of storeLogs) {
    if (log.depositor.toLowerCase() !== LP_LOCKER_V4.toLowerCase()) continue;
    const amount = log.amount;
    if (amount === 0n || amount === "0") continue;

    dailyFees.add(log.token, amount, METRIC.SWAP_FEES);
    if (isProtocolRecipient(log.feeOwner)) {
      dailyRevenue.add(log.token, amount, "LP Fees To Protocol");
    } else {
      dailySupplySideRevenue.add(log.token, amount, "LP Fees To Creators");
    }
  }

  // --- Active Uniswap v3 path: direct collect + split from lpLockerV3 ---
  const collectedLogs = await options.getLogs({
    target: LP_LOCKER_V3,
    eventAbi: REWARDS_COLLECTED,
    fromBlock: FACTORY_V3_DEPLOY_BLOCK,
  });

  if (collectedLogs.length) {
    const rewardInfos = await options.api.multiCall({
      abi: TOKEN_REWARDS_V3,
      calls: collectedLogs.map((log: any) => ({ target: LP_LOCKER_V3, params: [log.token] })),
      permitFailure: true,
    });

    for (let i = 0; i < collectedLogs.length; i++) {
      const log = collectedLogs[i];
      const info = rewardInfos[i];
      // permitFailure: multicall returned null/undefined — recoverable RPC/contract failure
      if (!info) {
        console.error(
          `[quiver] tokenRewards failed for token=${log.token} locker=${LP_LOCKER_V3}`,
        );
        continue;
      }
      // Present but empty recipients/bps: malformed or unconfigured reward data — skip quietly
      if (!info.recipients?.length || !info.rewardBps?.length) continue;

      const amount0 = BigInt(log.amount0);
      const amount1 = BigInt(log.amount1);
      if (amount0 === 0n && amount1 === 0n) continue;

      dailyFees.add(log.currency0, amount0, METRIC.SWAP_FEES);
      dailyFees.add(log.currency1, amount1, METRIC.SWAP_FEES);

      const recipients: string[] = info.recipients;
      const rewardBps: (number | string)[] = info.rewardBps;
      let allocated0 = 0n;
      let allocated1 = 0n;

      for (let j = 0; j < recipients.length; j++) {
        const isLast = j === recipients.length - 1;
        const share0 = isLast ? amount0 - allocated0 : (amount0 * BigInt(rewardBps[j])) / BPS;
        const share1 = isLast ? amount1 - allocated1 : (amount1 * BigInt(rewardBps[j])) / BPS;
        allocated0 += share0;
        allocated1 += share1;

        const toProtocol = isProtocolRecipient(recipients[j]);
        if (toProtocol) {
          dailyRevenue.add(log.currency0, share0, "LP Fees To Protocol");
          dailyRevenue.add(log.currency1, share1, "LP Fees To Protocol");
        } else {
          dailySupplySideRevenue.add(log.currency0, share0, "LP Fees To Creators");
          dailySupplySideRevenue.add(log.currency1, share1, "LP Fees To Creators");
        }
      }
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
    "Uniswap LP swap fees collected from Quiver-locked positions when collectRewards runs. Quiver does not charge a separate native launch fee; optional launch-tx ETH is a same-tx Uniswap buy, not a Quiver fee. Liquidity principal and gas are excluded. Trading volume is not counted (ordinary Uniswap activity).",
  Revenue:
    "Portion of collected LP fees credited to the Quiver protocol fee recipient (factory.teamFeeRecipient).",
  ProtocolRevenue:
    "Same as Revenue — LP fee share retained by the Quiver protocol fee recipient.",
  SupplySideRevenue:
    "Portion of collected LP fees credited to token creators (and any other non-protocol reward recipients configured at launch).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "Uniswap pool swap fees collected from Quiver-locked LP positions (v3 RewardsCollected; v4 StoreTokens from the Quiver LP locker).",
  },
  Revenue: {
    "LP Fees To Protocol":
      "Share of collected LP fees sent to factory.teamFeeRecipient (v3 rewardBps protocol slice; v4 StoreTokens feeOwner).",
  },
  ProtocolRevenue: {
    "LP Fees To Protocol":
      "Share of collected LP fees sent to factory.teamFeeRecipient (v3 rewardBps protocol slice; v4 StoreTokens feeOwner).",
  },
  SupplySideRevenue: {
    "LP Fees To Creators":
      "Share of collected LP fees sent to token creators / other non-protocol reward recipients.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  doublecounted: true, // Uniswap pool fees may also be attributed to Uniswap
  chains: [CHAIN.ROBINHOOD],
  fetch,
  // First Quiver factory deployment on Robinhood (legacy v4 factory).
  start: "2026-07-14",
};

export default adapter;

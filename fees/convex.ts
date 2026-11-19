import ADDRESSES from '../helpers/coreAssets.json'
import {Adapter, FetchOptions} from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {addTokensReceived} from "../helpers/token";
import {httpGet} from "../utils/fetchURL";
import BigNumber from "bignumber.js";

// ─── Contracts ────────────────────────────────────────────────────────────────
const BOOSTER   = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31"; // Convex Booster
const CRV_TOKEN = ADDRESSES.ethereum.CRV; // Curve DAO Token
const CVX_TOKEN = ADDRESSES.ethereum.CVX; // Convex Token
const FXS_TOKEN = ADDRESSES.ethereum.FXS; // Frax Share

// Reward recipients configured once by Booster.setRewardContracts.
const CVXCRV_STAKING = "0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e"; // lockRewards
const CVX_LOCKER_REWARDS = "0xcf50b810e57ac33b91dcf525c6ddd9881b139332"; // stakerRewards

const CONVEX_TREASURY = "0x1389388d01708118b497f59521f6943Be2541bb7";
// FXS revenue recipients — Convex's Frax-side fee distribution contracts.
// stkCvxFxs staking contract receives FXS for cvxFXS stakers and CVX lockers.
// FXS fee distributor handles LP provider and platform FXS allocations.
// Note: Frax gauge-based FXS emissions have wound down significantly post-2024;
// flows are near-zero on recent dates but the buckets remain for parity with
// the original adapter and will capture any future FXS revenue correctly.
const STKFXS_STAKING = "0x49b4d1dF40442f0C31b1BbAEA3EDE7c38e37E31a"; // stkCvxFxs rewards
const FXS_FEE_DISTRIB = "0x278dC748edA1d8eFEf1aDFB518542612b49Fcd34"; // FXS fee distributor

// On-chain reUSD revenue (existing logic — retained unchanged)
const CONVEX_PERMA_STAKER = "0xCCCCCccc94bFeCDd365b4Ee6B86108fC91848901".toLowerCase();
const reUSD     = "0x57aB1E0003F623289CD798B1824Be09a793e4Bec";
const registry  = "0x10101010E0C3171D894B71B3400668aF311e7D94";

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const abi = {
  getAddress: "function getAddress(string key) external view returns (address)",
  rewardPaid:  "event RewardPaid(address indexed user, address indexed rewardToken, address indexed recipient, uint256 reward)",
};

// ─── Bribe helper ─────────────────────────────────────────────────────────────
const fetchBribesUSDForDay = async (dayTimestamp: number): Promise<number> => {
  try {
    const url = "https://api.llama.airforce/dashboard/bribes-overview-votium";
    const response = await httpGet(url);
    const data = typeof response === "string" ? JSON.parse(response) : response;
    let total = 0;
    if (data?.dashboard?.epochs) {
      data.dashboard.epochs.forEach((epoch: any) => {
        if (epoch.end === dayTimestamp) {
          total += epoch.totalAmountDollars;
        }
      });
    }
    return total;
  } catch (e) {
    console.error("Convex: Failed to fetch Votium bribes", (e as Error).message);
    return 0; // llama.airforce unavailable — skip bribe revenue rather than failing adapter
  }
};

// ─── Methodology ──────────────────────────────────────────────────────────────
const methodology = {
  UserFees: "No user fees",
  Fees: "All CRV and FXS harvested through Convex: the protocol's own fee take (cvxCRV/cvxFXS stakers and CVX lockers) plus LP rewards, harvest incentives and treasury fees, plus reUSD locker revenue and Votium bribes.",
  HoldersRevenue: "CRV/CVX/FXS flowing to CVX lockers and cvxCRV/cvxFXS stakers, the CRV platform fee sent to vlCVX lockers before 2023-01-09, plus Votium bribes",
  Revenue: "Sum of protocol revenue and holders' revenue",
  ProtocolRevenue: "CRV platform fees (since 2023-01-09) and reUSD revenue directed to Convex treasury",
  SupplySideRevenue: "CRV rewards to pool stakers and incentives paid to harvest callers",
};

const breakdownMethodology = {
  Fees: {
    "CRV Revenue": "CRV harvested through Convex: the fee take flowing to cvxCRV stakers (lockIncentive) and CVX lockers (stakerIncentive), plus LP rewards, harvest incentives and treasury fees",
    "CVX Revenue": "CVX emissions flowing to cvxCRV stakers",
    "FXS Revenue": "FXS flowing to cvxFXS stakers, CVX lockers and LP providers via Convex's Frax-side fee contracts",
    "Others Revenue": "reUSD locker revenue",
    "Bribes Rewards": "Votium bribes",
  },
  Revenue: {
    "CRV Treasury Fees": "CRV platform fees transferred to the treasury during harvests (since 2023-01-09)",
    "CRV Platform Fees To vlCVX": "CRV platform fees sent to vlCVX staking proxies during harvests (2021-09-02 to 2023-01-09)",
    "CRV Revenue": "CRV to cvxCRV stakers and CVX lockers",
    "CVX Revenue": "CVX emissions to cvxCRV stakers",
    "FXS Revenue": "FXS distributed to cvxFXS stakers and CVX lockers",
    "Others Revenue": "reUSD revenue",
    "Bribes Revenue": "Votium bribes",
  },
  HoldersRevenue: {
    "CRV Revenue": "CRV directed to cvxCRV stakers and CVX lockers",
    "CRV Platform Fees To vlCVX": "CRV platform fees sent to vlCVX staking proxies during harvests (2021-09-02 to 2023-01-09)",
    "CVX Revenue": "CVX emissions to cvxCRV stakers",
    "FXS Revenue": "FXS directed to cvxFXS stakers and CVX lockers",
    "Bribes Revenue": "Votium bribes",
  },
  SupplySideRevenue: {
    "Harvest Incentives": "CRV paid to callers who harvest pool rewards",
    "CRV Revenue": "CRV rewards to LP stakers via Convex pool reward contracts",
    "FXS Revenue": "FXS rewards to LP providers via Convex's Frax gauge integration",
  },
  ProtocolRevenue: {
    "CRV Treasury Fees": "CRV platform fees transferred to the treasury during harvests (since 2023-01-09)",
    "Others Revenue": "reUSD yield retained by the treasury",
  },
};

// ─── Fetch ────────────────────────────────────────────────────────────────────
const fetch = async (options: FetchOptions) => {
  const { startTimestamp, createBalances } = options;
  const dayStart = Math.floor(startTimestamp / 86400) * 86400;

  // Booster._earmarkRewards emits CRV transfers in order:
  // optional treasury, caller, pool rewards, lock rewards, staker rewards.
  // Read actual payouts so fee/treasury changes and integer rounding are preserved.
  // https://github.com/convex-eth/platform/blob/main/contracts/contracts/Booster.sol
  const crvTransfers = await options.getLogs({
    target: CRV_TOKEN,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      "0x" + BOOSTER.slice(2).toLowerCase().padStart(64, "0"),
    ],
    entireLog: true,
  });
  const transactions = new Map<string, any[]>();
  const seenTransfers = new Set<string>();
  for (const log of crvTransfers) {
    const index = Number(log.logIndex ?? log.index);
    if (!log.transactionHash || !Number.isSafeInteger(index) || index < 0)
      throw new Error('Missing Booster CRV transfer ordering');
    const hash = log.transactionHash.toLowerCase();
    const key = `${hash}:${index}`;
    if (seenTransfers.has(key)) throw new Error(`Duplicate Booster CRV transfer ${key}`);
    seenTransfers.add(key);
    const logs = transactions.get(hash) ?? [];
    logs.push(log);
    transactions.set(hash, logs);
  }
  const amounts = { lock: 0n, staker: 0n, treasury: 0n, platformToLockers: 0n, caller: 0n, lp: 0n };
  const lockAddress = CVXCRV_STAKING.toLowerCase();
  const stakerAddress = CVX_LOCKER_REWARDS.toLowerCase();
  const treasuryAddress = CONVEX_TREASURY.toLowerCase();
  for (const [hash, logs] of transactions) {
    logs.sort((a, b) => Number(a.logIndex ?? a.index) - Number(b.logIndex ?? b.index));
    let payouts: any[] = [];
    for (const log of logs) {
      payouts.push(log.args);
      if (log.args.to.toLowerCase() !== stakerAddress ||
          payouts[payouts.length - 2]?.to.toLowerCase() !== lockAddress || payouts.length < 4) continue;
      if (payouts.length !== 4 && payouts.length !== 5)
        throw new Error(`Unexpected Booster CRV distribution in ${hash}`);
      const offset = payouts.length === 5 ? 1 : 0;
      if (offset) {
        if (payouts[0].to.toLowerCase() === treasuryAddress) amounts.treasury += BigInt(payouts[0].value);
        else amounts.platformToLockers += BigInt(payouts[0].value);
      }
      amounts.caller += BigInt(payouts[offset].value);
      amounts.lp += BigInt(payouts[offset + 1].value);
      amounts.lock += BigInt(payouts[offset + 2].value);
      amounts.staker += BigInt(payouts[offset + 3].value);
      payouts = [];
    }
    if (payouts.length) throw new Error(`Unclassified Booster CRV transfers in ${hash}`);
  }
  // CVX emissions received by cvxCRV stakers (lockIncentive earns CVX too)
  const cvxCrvStakerCVX = createBalances();
  await addTokensReceived({
    token: CVX_TOKEN,
    fromAddressFilter: BOOSTER,
    target: CVXCRV_STAKING,
    options,
    balances: cvxCrvStakerCVX,
  });

  // ── FXS revenue via on-chain distribution events ──────────────────────────
  // Previous approach tracked inbound FXS transfers to these contracts, which
  // misrepresents daily revenue (FXS arrives in batches, not per-distribution).
  // noateden: use reward distribution/claim events instead.
  //
  //   FXS_FEE_DISTRIB → RewardDistributed(gauge_address, reward_amount)
  //     FXS pushed out to each gauge → supply-side (LP providers)
  //   STKFXS_STAKING  → RewardPaid(_user, _rewardsToken, _reward) filtered by FXS
  //     FXS claimed by cvxFXS stakers / CVX lockers → holders revenue
  const [fxsDistribLogs, fxsStakingLogs] = await Promise.all([
    options.getLogs({
      target: FXS_FEE_DISTRIB,
      eventAbi: "event RewardDistributed(address indexed gauge_address, uint256 reward_amount)",
    }),
    options.getLogs({
      target: STKFXS_STAKING,
      eventAbi: "event RewardPaid(address indexed _user, address indexed _rewardsToken, uint256 _reward)",
    }),
  ]);

  const fxsDistribAmount = fxsDistribLogs.reduce(
    (acc: bigint, log: any) => acc + BigInt(log.reward_amount), 0n
  );
  const fxsStakingAmount = fxsStakingLogs
    .filter((log: any) => log._rewardsToken.toLowerCase() === FXS_TOKEN.toLowerCase())
    .reduce((acc: bigint, log: any) => acc + BigInt(log._reward), 0n);

  // ── reUSD on-chain revenue (existing logic) ────────────────────────────────
  let reUSDRevenue = new BigNumber(0);
  const isAfterReUSDIntegration = startTimestamp >= 1711152000; // 2024-03-23
  if (isAfterReUSDIntegration) {
    const stakerAddress = await options.api.call({
      target: registry,
      abi: abi.getAddress,
      params: ["STAKER"],
      permitFailure: true,
    });
    if (stakerAddress) {
      const rewardPaidLogs = await options.getLogs({
        target: stakerAddress,
        eventAbi: abi.rewardPaid,
      });
      rewardPaidLogs.forEach((log: any) => {
        if (
          log.user.toLowerCase() === CONVEX_PERMA_STAKER &&
          log.rewardToken.toLowerCase() === reUSD.toLowerCase()
        ) {
          reUSDRevenue = reUSDRevenue.plus(new BigNumber(log.reward).div(1e18));
        }
      });
    }
  }

  // ── Bribe revenue ─────────────────────────────────────────────────────────
  const dailyBribeRevenue = await fetchBribesUSDForDay(dayStart);

  // ── Assemble balances ──────────────────────────────────────────────────────
  const dailyFees             = createBalances();
  const dailyRevenue          = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue   = createBalances();
  const dailyProtocolRevenue  = createBalances();

  const holdersCRV = amounts.lock + amounts.staker;
  const grossCRV = holdersCRV + amounts.lp + amounts.caller + amounts.treasury + amounts.platformToLockers;
  dailyFees.add(CRV_TOKEN, grossCRV, "CRV Revenue");
  dailyRevenue.add(CRV_TOKEN, holdersCRV, "CRV Revenue");
  dailyHoldersRevenue.add(CRV_TOKEN, holdersCRV, "CRV Revenue");

  // CVX emissions to cvxCRV stakers
  dailyFees.addBalances(cvxCrvStakerCVX, "CVX Revenue");
  dailyRevenue.addBalances(cvxCrvStakerCVX, "CVX Revenue");
  dailyHoldersRevenue.addBalances(cvxCrvStakerCVX, "CVX Revenue");

  // Actual LP reward payouts.
  dailySupplySideRevenue.add(CRV_TOKEN, amounts.lp, "CRV Revenue");

  dailyRevenue.add(CRV_TOKEN, amounts.treasury, "CRV Treasury Fees");
  dailyProtocolRevenue.add(CRV_TOKEN, amounts.treasury, "CRV Treasury Fees");
  dailyRevenue.add(CRV_TOKEN, amounts.platformToLockers, "CRV Platform Fees To vlCVX");
  dailyHoldersRevenue.add(CRV_TOKEN, amounts.platformToLockers, "CRV Platform Fees To vlCVX");
  dailySupplySideRevenue.add(CRV_TOKEN, amounts.caller, "Harvest Incentives");

  // FXS claimed by cvxFXS stakers / CVX lockers (STKFXS_STAKING) → fees + revenue + holders
  if (fxsStakingAmount > 0n) {
    dailyFees.add(FXS_TOKEN, fxsStakingAmount, "FXS Revenue");
    dailyRevenue.add(FXS_TOKEN, fxsStakingAmount, "FXS Revenue");
    dailyHoldersRevenue.add(FXS_TOKEN, fxsStakingAmount, "FXS Revenue");
  }

  // FXS distributed to gauges/LP providers (FXS_FEE_DISTRIB) → fees + supply-side only
  if (fxsDistribAmount > 0n) {
    dailyFees.add(FXS_TOKEN, fxsDistribAmount, "FXS Revenue");
    dailySupplySideRevenue.add(FXS_TOKEN, fxsDistribAmount, "FXS Revenue");
  }

  // reUSD revenue -> protocol treasury
  dailyFees.addUSDValue(reUSDRevenue.toNumber(), "Others Revenue");
  dailyRevenue.addUSDValue(reUSDRevenue.toNumber(), "Others Revenue");
  dailyProtocolRevenue.addUSDValue(reUSDRevenue.toNumber(), "Others Revenue");

  // Votium bribes -> flow to vlCVX lockers (token holders), not the treasury
  dailyFees.addUSDValue(dailyBribeRevenue, "Bribes Rewards");
  dailyRevenue.addUSDValue(dailyBribeRevenue, "Bribes Revenue");
  dailyHoldersRevenue.addUSDValue(dailyBribeRevenue, "Bribes Revenue");

  return {
    dailyFees,
    dailyUserFees: 0,
    dailyRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

// ─── Adapter ──────────────────────────────────────────────────────────────────
const adapter: Adapter = {
  version: 2,
  // Must stay daily: Votium bribe revenue (fetchBribesUSDForDay) is only available as
  // whole-day epochs keyed by `epoch.end === dayStart`. Running hourly makes every one of
  // the day's 24 slots match the same epoch and add the full daily bribe total, counting
  // bribe revenue ~24x. Do not set pullHourly: true here.
  pullHourly: false,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2021-05-17",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;

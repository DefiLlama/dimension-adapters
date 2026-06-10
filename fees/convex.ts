import {Adapter, FetchOptions} from "../adapters/types";
import {CHAIN} from "../helpers/chains";
import {addTokensReceived} from "../helpers/token";
import {httpGet} from "../utils/fetchURL";
import BigNumber from "bignumber.js";

// ─── Contracts ────────────────────────────────────────────────────────────────
const BOOSTER   = "0xF403C135812408BFbE8713b5A23a04b3D48AAE31"; // Convex Booster
const CRV_TOKEN = "0xD533a949740bb3306d119CC777fa900bA034cd52"; // Curve DAO Token
const CVX_TOKEN = "0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B"; // Convex Token
const FXS_TOKEN = "0x3432B6A60D23Ca0dFCa7761B7ab56459D9C964D0"; // Frax Share

// Convex protocol fee recipients — verified by inspecting CRV Transfer events
// from the Booster (0xF403...AAE31) over a 7-day window via Ethereum event logs.
// These two addresses receive CRV every single day proportional to fee rates.
const CVXCRV_STAKING = "0x3Fe65692bfCD0e6CF84cB1E7d24108E434A7587e"; // lockRewards (10% of CRV)
const CVX_LOCKER_REWARDS = "0xcf50b810e57ac33b91dcf525c6ddd9881b139332"; // stakerRewards (~4.5% of CRV)

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
const boosterAbi = {
  lockIncentive:   "function lockIncentive() view returns (uint256)",
  stakerIncentive: "function stakerIncentive() view returns (uint256)",
  earmarkIncentive:"function earmarkIncentive() view returns (uint256)",
  platformFee:     "function platformFee() view returns (uint256)",
};

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
  Fees: "CRV and FXS earned by cvxCRV/cvxFXS stakers and CVX lockers from Convex's fee take, plus reUSD locker revenue and Votium bribes. Supply-side LP CRV rewards excluded from dailyFees.",
  HoldersRevenue: "CRV/CVX/FXS flowing to CVX lockers and cvxCRV/cvxFXS stakers, plus Votium bribes",
  Revenue: "Sum of protocol revenue and holders' revenue",
  ProtocolRevenue: "reUSD revenue directed to Convex treasury",
  SupplySideRevenue: "CRV rewards received by LP stakers on Convex pools",
};

const breakdownMethodology = {
  Fees: {
    "CRV Revenue": "CRV flowing to cvxCRV stakers (lockIncentive) and CVX lockers (stakerIncentive)",
    "CVX Revenue": "CVX emissions flowing to cvxCRV stakers",
    "FXS Revenue": "FXS flowing to cvxFXS stakers, CVX lockers and LP providers via Convex's Frax-side fee contracts",
    "Others Revenue": "reUSD locker revenue",
    "Bribes Rewards": "Votium bribes",
  },
  Revenue: {
    "CRV Revenue": "CRV to cvxCRV stakers and CVX lockers",
    "CVX Revenue": "CVX emissions to cvxCRV stakers",
    "FXS Revenue": "FXS distributed to cvxFXS stakers and CVX lockers",
    "Others Revenue": "reUSD revenue",
    "Bribes Revenue": "Votium bribes",
  },
  HoldersRevenue: {
    "CRV Revenue": "CRV directed to cvxCRV stakers and CVX lockers",
    "CVX Revenue": "CVX emissions to cvxCRV stakers",
    "FXS Revenue": "FXS directed to cvxFXS stakers and CVX lockers",
    "Bribes Revenue": "Votium bribes",
  },
  SupplySideRevenue: {
    "CRV Revenue": "CRV rewards to LP stakers via Convex pool reward contracts",
    "FXS Revenue": "FXS rewards to LP providers via Convex's Frax gauge integration",
  },
  ProtocolRevenue: {
    "Others Revenue": "reUSD yield retained by the treasury",
  },
};

// ─── Fetch ────────────────────────────────────────────────────────────────────
const fetch = async (options: FetchOptions) => {
  const { startTimestamp, createBalances } = options;
  const dayStart = Math.floor(startTimestamp / 86400) * 86400;

  // Read current Booster fee rates (in basis points out of 10_000)
  const [lockIncentive, stakerIncentive, earmarkIncentive, platformFee] =
    await Promise.all([
      options.api.call({ target: BOOSTER, abi: boosterAbi.lockIncentive }),
      options.api.call({ target: BOOSTER, abi: boosterAbi.stakerIncentive }),
      options.api.call({ target: BOOSTER, abi: boosterAbi.earmarkIncentive }),
      options.api.call({ target: BOOSTER, abi: boosterAbi.platformFee }),
    ]);

  // Total protocol fee rate (portion NOT going to LPs)
  const protocolFeeBps =
    Number(lockIncentive) + Number(stakerIncentive) +
    Number(earmarkIncentive) + Number(platformFee);

  // ── Track CRV flowing to protocol fee recipients ─────────────────────────
  // CVXCRV_STAKING receives `lockIncentive` % of all CRV harvested.
  // CVX_LOCKER_REWARDS receives `stakerIncentive` % of all CRV harvested.
  // From these two amounts and the known fee split we can extrapolate total CRV
  // fees and LP supply-side CRV without scanning all pool reward contracts.

  const cvxCrvStakerCRV = createBalances();
  const cvxLockerCRV    = createBalances();

  await Promise.all([
    addTokensReceived({
      token: CRV_TOKEN,
      fromAddressFilter: BOOSTER,
      target: CVXCRV_STAKING,
      options,
      balances: cvxCrvStakerCRV,
    }),
    addTokensReceived({
      token: CRV_TOKEN,
      fromAddressFilter: BOOSTER,
      target: CVX_LOCKER_REWARDS,
      options,
      balances: cvxLockerCRV,
    }),
  ]);

  // CVX emissions received by cvxCRV stakers (lockIncentive earns CVX too)
  const cvxCrvStakerCVX = createBalances();
  await addTokensReceived({
    token: CVX_TOKEN,
    fromAddressFilter: BOOSTER,
    target: CVXCRV_STAKING,
    options,
    balances: cvxCrvStakerCVX,
  });

  // ── Extrapolate LP supply-side CRV via the on-chain fee rates ─────────────
  // CVXCRV_STAKING receives exactly `lockIncentive` bps of all CRV harvested.
  // From that single amount and the fee split we can derive LP CRV without
  // scanning every individual pool reward contract.
  //
  //   cvxCrvAmount  = lockIncentive bps worth of total CRV
  //   total CRV     = cvxCrvAmount ÷ lockIncentive × 10_000
  //   LP CRV        = total CRV × supplyBps ÷ 10_000
  //                 = cvxCrvAmount × supplyBps ÷ lockIncentive
  //
  // We fetch CRV transfers directly with topic filters rather than reading back
  // from cvxCrvStakerCRV.getBalances(). The SDK's sumSingleBalance stores values
  // via Number(bigint).toString(), which produces scientific notation strings
  // (e.g. "2.9e+22") for large wei amounts — BigInt() cannot parse these, and
  // the Number() conversion has already discarded the low-order digits.
  const lockBps   = Number(lockIncentive);
  const supplyBps = 10_000 - protocolFeeBps;

  const supplySideCRV = createBalances();
  if (lockBps > 0) {
    // Mirror the topic filter used internally by addTokensReceived
    const TRANSFER_SIG = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const pad32 = (addr: string) => "0x" + addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
    const stakingTransfers = await options.getLogs({
      target: CRV_TOKEN,
      eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
      topics: [TRANSFER_SIG, pad32(BOOSTER), pad32(CVXCRV_STAKING)],
    });
    const cvxCrvRawAmount = stakingTransfers.reduce(
      (acc: bigint, log: any) => acc + BigInt(log.value), 0n
    );
    const lpCRVAmount = cvxCrvRawAmount * BigInt(supplyBps) / BigInt(lockBps);
    supplySideCRV.add(CRV_TOKEN, lpCRVAmount, "CRV Revenue");
  }

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

  // CRV to cvxCRV stakers
  dailyFees.addBalances(cvxCrvStakerCRV, "CRV Revenue");
  dailyRevenue.addBalances(cvxCrvStakerCRV, "CRV Revenue");
  dailyHoldersRevenue.addBalances(cvxCrvStakerCRV, "CRV Revenue");

  // CRV to CVX lockers
  dailyFees.addBalances(cvxLockerCRV, "CRV Revenue");
  dailyRevenue.addBalances(cvxLockerCRV, "CRV Revenue");
  dailyHoldersRevenue.addBalances(cvxLockerCRV, "CRV Revenue");

  // CVX emissions to cvxCRV stakers
  dailyFees.addBalances(cvxCrvStakerCVX, "CVX Revenue");
  dailyRevenue.addBalances(cvxCrvStakerCVX, "CVX Revenue");
  dailyHoldersRevenue.addBalances(cvxCrvStakerCVX, "CVX Revenue");

  // LP supply-side CRV (extrapolated)
  dailySupplySideRevenue.addBalances(supplySideCRV, "CRV Revenue");

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

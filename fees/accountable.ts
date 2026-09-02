import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const config: Record<string, { factories: string[], start: string }> = {
  [CHAIN.MONAD]: {
    factories: [
      "0x606556A6B544ecDcbf15aF73A63B67516dc16Ad7",
      "0x8a5Caf00C3EB20aEC11Fc35C153a8601Cd127fEd",
      "0x2f5CAc28cf80D465d7C8D67a49c8e36710a4B83B",
      "0x4927Ce3402035b801A1bEdDC498b7fb2fe9eA181",
      "0x9f1EB2be7b6a7e611c270bbdb0A3358786769518",
    ],
    start: "2025-11-27",
  },
  [CHAIN.ETHEREUM]: {
    factories: [
      "0x333a12e2B519DA16EBE75012d54574C16ef4463f",
      "0xDAc0e7EffB16B249d1Bb672D25D7827481Be2081",
      "0x2A7F22f81A3d301b8f0EAf4f09a78558c91Fc69a",
      "0xB4082B8126AF8B5345CfB159AC5d4b4F05F54bC5",
      "0xC0f778b51bF9751BBccBF4e78A107026aDaDbe43",
    ],
    start: "2026-01-16",
  },
  // Base is commented out: Accountable no longer has any active vault on this
  // chain, so there is nothing left to enumerate here going forward.
  // [CHAIN.BASE]: {
  //   factories: [
  //     "0x2A7F22f81A3d301b8f0EAf4f09a78558c91Fc69a",
  //     "0xB4082B8126AF8B5345CfB159AC5d4b4F05F54bC5",
  //     "0xC0f778b51bF9751BBccBF4e78A107026aDaDbe43",
  //   ],
  //   start: "2026-04-20",
  // },
  [CHAIN.ARBITRUM]: {
    factories: [
      "0x2A7F22f81A3d301b8f0EAf4f09a78558c91Fc69a",
      "0xB4082B8126AF8B5345CfB159AC5d4b4F05F54bC5",
      "0xC0f778b51bF9751BBccBF4e78A107026aDaDbe43",
      "0x333a12e2B519DA16EBE75012d54574C16ef4463f",
      "0xDAc0e7EffB16B249d1Bb672D25D7827481Be2081",
    ],
    start: "2026-02-13",
  },
  [CHAIN.ROBINHOOD]: {
    factories: [
      "0x017273Eeb06Ee9f863020269417DB9559FD94173",
      "0x474B612F970491801743BF0e4B9153620FC36096",
      "0xA4d6a4aD35fc632aEE1dC48A2aEc2aaa37B51F9f",
    ],
    start: "2026-07-22",
  },
  [CHAIN.CITREA]: {
    factories: [
      "0x4927Ce3402035b801A1bEdDC498b7fb2fe9eA181",
      "0x2f5CAc28cf80D465d7C8D67a49c8e36710a4B83B",
      "0x9f1EB2be7b6a7e611c270bbdb0A3358786769518",
    ],
    start: "2026-04-21",
  },
};

// aHYPER Looping Vault (vault 0x23b148d8f389C5821739381f1FF87bB7e1162566) is
// EOA-deployed rather than created by a registered factory, so enumeration
// cannot reach it. Excluded from fee tracking: it's a hidden, still-in-testing
// vault whose configured 10% performanceFee/50% managerSplit is not actually
// being charged, so booking fees off its share-price growth would overstate
// protocol revenue. Re-add once fee collection is live for it. The TVL
// adapter carries the EOA-deployed exception separately and is unaffected.
const EXTRA_STRATEGIES: Record<string, { address: string, deployedOn: string }[]> = {};

const abis = {
  getStrategiesCount: "function getStrategiesCount() view returns (uint256)",
  getStrategiesPaginated:
    "function getStrategiesPaginated(uint256,uint256) view returns (address[])",
  scaleFactor: "function scaleFactor() view returns (uint256)",
  vault: "function vault() view returns (address)",
  feeManager: "function feeManager() view returns (address)",
  netPrincipal: "function netPrincipal() view returns (uint256)",
  asset: "function asset() view returns (address)",
  totalSupply: "function totalSupply() view returns (uint256)",
  convertToAssets: "function convertToAssets(uint256) view returns (uint256)",
  performanceFee: "function performanceFee(address) view returns (uint256)",
  managementFee: "function managementFee(address) view returns (uint256)",
  managerSplit: "function managerSplit(address,bool) view returns (uint256)",
  managerSplitLegacy: "function managerSplit(address) view returns (uint256)",
  delinquencyStartTime:
    "function delinquencyStartTime() view returns (uint256)",
  penaltiesEnabled: "function penaltiesEnabled() view returns (bool)",
  loan: "function loan() view returns ((uint256 minDeposit,uint256 minRedeem,uint256 maxCapacity,uint256 minCapacity,uint256 reserveThreshold,uint256 outstandingPrincipal,uint256 outstandingInterest,uint256 drawableFunds,uint256 interestRate,uint256 lateInterestPenalty,uint256 claimableInterest,uint256 interestInterval,uint256 startTime,uint256 termsSetTime,uint256 termsUpdateTime,uint256 duration,uint256 depositPeriod,uint256 acceptGracePeriod,uint256 withdrawalPeriod,uint256 lateInterestGracePeriod))",
  feeSharesMinted:
    "event FeeSharesMinted(address indexed recipient, uint256 shares)",
};

// `scaleFactor()` on the credit strategies is an accrual index scaled by 1e36,
// not the 1e18 that is usual elsewhere.
const PRECISION = 10n ** 36n;
// Accountable's FeeManager expresses every fee and every split against 1e6, so
// these are not basis points: a `performanceFee` of 100_000 is 10% and a
// `managerSplit` of 500_000 is an even split.
const FEE_DENOMINATOR = 1_000_000n;
const DEPOSITORS = "Earnings To Depositors";
const MANAGER = "Fees To Vault Manager";
const PROTOCOL = "Fees To Protocol";

const big = (v: any) => (v === null || v === undefined ? 0n : BigInt(v));

const listStrategies = async (options: FetchOptions): Promise<string[]> => {
  const api = options.toApi;
  const factories = config[api.chain]?.factories || [];
  const counts = await api.multiCall({
    abi: abis.getStrategiesCount,
    calls: factories,
    permitFailure: true,
  });

  // A single null is expected: the factories are CREATE2-deployed, so the same
  // address is listed on every chain and reverts on the ones it was never
  // deployed to. All of them failing is an RPC problem, not an empty chain.
  if (factories.length && counts.every((c: any) => c === null))
    throw new Error(
      `Accountable: every factory call failed on ${api.chain}, refusing to report zero`,
    );

  const pages = factories
    .map((target, i) => ({ target, count: Number(counts[i] || 0) }))
    .filter((f) => f.count > 0)
    .map((f) => ({ target: f.target, params: [0, f.count] }));

  const lists = pages.length
    ? await api.multiCall({
      abi: abis.getStrategiesPaginated,
      calls: pages,
      permitFailure: true,
    })
    : [];

  // A page is only requested for a factory that reported a non-zero count, so a
  // null here is a failed read and must not be silently treated as no vaults.
  const seen = new Set<string>();
  lists.forEach((list: any, i: number) => {
    if (!list)
      throw new Error(
        `Accountable: could not list strategies of ${pages[i].target} on ${api.chain}`,
      );
    for (const s of list) seen.add(s.toLowerCase());
  });
  for (const s of EXTRA_STRATEGIES[api.chain] || []) {
    if (options.dateString >= s.deployedOn) {
      seen.add(s.address.toLowerCase());
    }
  }
  return Array.from(seen);
};

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi, createBalances } = options;

  const strategies = await listStrategies(options);
  if (!strategies.length)
    return {
      dailyFees: createBalances(),
      dailyUserFees: createBalances(),
      dailySupplySideRevenue: createBalances(),
      dailyRevenue: createBalances(),
      dailyProtocolRevenue: createBalances(),
    };

  const sfStart = await fromApi.multiCall({
    abi: abis.scaleFactor,
    calls: strategies,
    permitFailure: true,
  });
  const sfEnd = await toApi.multiCall({
    abi: abis.scaleFactor,
    calls: strategies,
    permitFailure: true,
  });
  const loansStart = await fromApi.multiCall({
    abi: abis.loan,
    calls: strategies,
    permitFailure: true,
  });
  const loansEnd = await toApi.multiCall({
    abi: abis.loan,
    calls: strategies,
    permitFailure: true,
  });
  const feeManagers = await toApi.multiCall({
    abi: abis.feeManager,
    calls: strategies,
    permitFailure: true,
  });
  const vaults = await toApi.multiCall({
    abi: abis.vault,
    calls: strategies,
    permitFailure: true,
  });
  const npStart = await fromApi.multiCall({
    abi: abis.netPrincipal,
    calls: strategies,
    permitFailure: true,
  });
  const npEnd = await toApi.multiCall({
    abi: abis.netPrincipal,
    calls: strategies,
    permitFailure: true,
  });
  const delinqStart = await toApi.multiCall({
    abi: abis.delinquencyStartTime,
    calls: strategies,
    permitFailure: true,
  });
  const penaltiesOn = await toApi.multiCall({
    abi: abis.penaltiesEnabled,
    calls: strategies,
    permitFailure: true,
  });

  const lending: number[] = [];
  const priced: number[] = [];
  strategies.forEach((_, i) => {
    // Every strategy has a vault, so a null here is a failed read rather than a
    // strategy to skip, and skipping it would drop its whole day of yield.
    if (!vaults[i])
      throw new Error(
        `Accountable: could not read the vault of ${strategies[i]} on ${options.chain}`,
      );
    // `scaleFactor()` only exists on the credit strategies, so a revert is the
    // classification signal here rather than a failed read. It is taken at the
    // closing block alone: a strategy created mid-window answers at the end but
    // not at the start, and requiring both would route it down the wrong path.
    if (sfEnd[i] !== null) lending.push(i);
    else priced.push(i);
  });

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const book = (
    token: string,
    interest: bigint,
    manager: bigint,
    protocol: bigint,
    metric: string,
  ) => {
    const depositors = interest - manager - protocol;
    dailyFees.add(token, interest, metric);
    dailySupplySideRevenue.add(token, depositors, DEPOSITORS);
    dailySupplySideRevenue.add(token, manager, MANAGER);
    dailyProtocolRevenue.add(token, protocol, PROTOCOL);
  };

  // Interest is charged on the principal actually drawn. The current strategy
  // generation exposes it as `netPrincipal()`; the first one does not, and the
  // debt it does expose is stored scaled by the accrual index, which brackets
  // the answer: `outstandingPrincipal` is the value if every draw happened at
  // today's index, `outstandingPrincipal * index` the value if every draw
  // happened at index 1. Under roughly uniform draws the average index at draw
  // sits at the midpoint, which is what is taken below; measured against the
  // reference series on two spread dates it landed within 1.6%.
  const drawn = (np: any, loan: any, sf: any) => {
    if (np !== null && np !== undefined) return big(np);
    if (!loan) return 0n;
    const scaled = big(loan.outstandingPrincipal);
    const index = big(sf);
    if (index <= PRECISION) return scaled;
    return (scaled * (PRECISION + index)) / (2n * PRECISION);
  };

  const elapsed = BigInt(
    Math.round(options.endTimestamp - options.startTimestamp),
  );
  const YEAR = 365n * 86400n;

  const DAY = 86400n;
  const windowStart = BigInt(Math.round(options.startTimestamp));
  const windowEnd = BigInt(Math.round(options.endTimestamp));

  const analyticInterest = (i: number, base: bigint) => {
    const loan = loansEnd[i] || loansStart[i];
    if (!loan) return 0n;
    const rate = big(loan.interestRate);

    let penaltySeconds = 0n;
    const started = big(delinqStart[i]);
    if (penaltiesOn[i] && started > 0n) {
      const penaltyFrom = started + big(loan.lateInterestGracePeriod);
      const from = penaltyFrom > windowStart ? penaltyFrom : windowStart;
      if (windowEnd > from) penaltySeconds = windowEnd - from;
      if (penaltySeconds > elapsed) penaltySeconds = elapsed;
    }
    const penalty = penaltySeconds > 0n ? big(loan.lateInterestPenalty) : 0n;

    // The two rates run on different periods, and the contract's own accrual
    // reflects that: its interest term divides `interestRate` by a year, while
    // its penalty term divides `lateInterestPenalty` by a single day. So
    // `interestRate` is prorated over YEAR and `lateInterestPenalty` over DAY,
    // both against FEE_DENOMINATOR.
    return (
      (base * (rate * elapsed * DAY + penalty * penaltySeconds * YEAR)) /
      (YEAR * DAY * FEE_DENOMINATOR)
    );
  };

  const active = lending
    .map((i) => {
      const base =
        (drawn(npStart[i], loansStart[i], sfStart[i]) +
          drawn(npEnd[i], loansEnd[i], sfEnd[i])) /
        2n;
      const previews =
        sfStart[i] !== null && npStart[i] !== null && npEnd[i] !== null;
      const interest = previews
        ? (base * (big(sfEnd[i]) - big(sfStart[i]))) / PRECISION
        : analyticInterest(i, base);
      const debt =
        loansEnd[i] && sfEnd[i]
          ? (big(loansEnd[i].outstandingPrincipal) * big(sfEnd[i])) / PRECISION
          : 0n;
      return { i, interest, aum: debt > 0n ? debt : base };
    })

  const orphan = [...active.map((a) => a.i), ...priced].find(
    (i) => !feeManagers[i],
  );
  if (orphan !== undefined)
    throw new Error(
      `Accountable: no feeManager for ${strategies[orphan]} on ${options.chain}, refusing to book its yield as fee-free`,
    );

  if (active.length) {
    const fmCall = (abi: string, extra?: boolean) =>
      toApi.multiCall({
        abi,
        calls: active.map((a) => ({
          target: feeManagers[a.i],
          params: (extra === undefined
            ? [strategies[a.i]]
            : [strategies[a.i], extra]) as any,
        })),
        permitFailure: true,
      });

    const assets = await toApi.multiCall({
      abi: abis.asset,
      calls: active.map((a) => vaults[a.i]),
      permitFailure: true,
    });
    const perfFees = await fmCall(abis.performanceFee);
    const mgmtFees = await fmCall(abis.managementFee);
    const perfSplits = await fmCall(abis.managerSplit, true);
    const mgmtSplits = await fmCall(abis.managerSplit, false);
    const legacySplits = await fmCall(abis.managerSplitLegacy);

    active.forEach((a, k) => {
      const token = assets[k];
      if (!token)
        throw new Error(
          `Accountable: could not read the asset of ${strategies[a.i]} on ${options.chain}`,
        );

      // The performance fee and the manager split are what separate protocol
      // revenue from the manager's cut, so a failed read of either must not
      // pass as a zero rate. The nulls that are expected: `managementFee` is
      // absent from the first-generation FeeManagers, and of the two
      // `managerSplit` overloads only one exists on any given generation.
      if (perfFees[k] === null)
        throw new Error(
          `Accountable: could not read the performance fee of ${strategies[a.i]} on ${options.chain}`,
        );
      if (perfSplits[k] === null && legacySplits[k] === null)
        throw new Error(
          `Accountable: could not read the manager split of ${strategies[a.i]} on ${options.chain}`,
        );

      const perfFee = (a.interest * big(perfFees[k])) / FEE_DENOMINATOR;
      const mgmtFee =
        (a.aum * big(mgmtFees[k]) * elapsed) / (YEAR * FEE_DENOMINATOR);
      const total = perfFee + mgmtFee;

      // Capped at the interest so that fees = supply side + revenue stays exact.
      // A management fee accrues on AUM, so in a very low interest window it can
      // exceed the interest earned; the excess is dropped rather than reported.
      const charged = total > a.interest ? a.interest : total;
      const perfPart = total === 0n ? 0n : (charged * perfFee) / total;
      const mgmtPart = charged - perfPart;

      const perfSplit = big(perfSplits[k] ?? legacySplits[k]);
      const mgmtSplit = big(mgmtSplits[k] ?? legacySplits[k]);
      const manager =
        (perfPart * perfSplit) / FEE_DENOMINATOR +
        (mgmtPart * mgmtSplit) / FEE_DENOMINATOR;

      book(
        token,
        a.interest,
        manager,
        charged - manager,
        METRIC.BORROW_INTEREST,
      );
    });
  }

  if (priced.length) {
    const pricedVaults = priced.map((i) => vaults[i]);
    const supply0 = await fromApi.multiCall({
      abi: abis.totalSupply,
      calls: pricedVaults,
      permitFailure: true,
    });
    // A vault deployed mid-window cannot be read at the opening block at all,
    // and that is the one case where a missing opening supply is legitimate
    // rather than a failed read. This distinguishes the two.
    const openedBefore = await fromApi.multiCall({
      abi: abis.asset,
      calls: pricedVaults,
      permitFailure: true,
    });
    const assetAddrs = await toApi.multiCall({
      abi: abis.asset,
      calls: pricedVaults,
      permitFailure: true,
    });
    const mintLogs = await options.getLogs({
      targets: priced.map((i) => strategies[i]),
      eventAbi: abis.feeSharesMinted,
      entireLog: true,
      parseLog: true,
    });

    // Grouped by `log.address` rather than by call index: `getLogs` does not
    // align its result with the target array, and indexing it would attribute
    // one strategy's mints to another.
    const mintedShares: Record<string, bigint> = {};
    for (const log of mintLogs || []) {
      const key = log.address.toLowerCase();
      mintedShares[key] = (mintedShares[key] || 0n) + BigInt(log.args.shares);
    }
    const minted = priced.map(
      (i) => mintedShares[strategies[i].toLowerCase()] || 0n,
    );

    const pricedFmCall = (abi: string, extra?: boolean) =>
      toApi.multiCall({
        abi,
        calls: priced.map((i) => ({
          target: feeManagers[i],
          params: (extra === undefined
            ? [strategies[i]]
            : [strategies[i], extra]) as any,
        })),
        permitFailure: true,
      });

    const openAssets = await fromApi.multiCall({
      abi: abis.convertToAssets,
      calls: pricedVaults.map((v, k) => ({
        target: v,
        params: [supply0[k] || 0],
      })),
      permitFailure: true,
    });
    const closeAssets = await toApi.multiCall({
      abi: abis.convertToAssets,
      calls: pricedVaults.map((v, k) => ({
        target: v,
        params: [supply0[k] || 0],
      })),
      permitFailure: true,
    });
    const mintedAssets = await toApi.multiCall({
      abi: abis.convertToAssets,
      calls: pricedVaults.map((v, k) => ({
        target: v,
        params: [minted[k].toString()],
      })),
      permitFailure: true,
    });
    const pricedPerfFees = await pricedFmCall(abis.performanceFee);
    const pricedSplits = await pricedFmCall(abis.managerSplit, true);
    const pricedLegacySplits = await pricedFmCall(abis.managerSplitLegacy);

    priced.forEach((_, k) => {
      const token = assetAddrs[k];
      if (!token)
        throw new Error(
          `Accountable: could not read the asset of ${strategies[priced[k]]} on ${options.chain}`,
        );
      // Reading the opening supply as zero would price the whole window off a
      // zero share amount and report no yield at all, so it is only allowed
      // where the vault did not yet exist at that block.
      if (supply0[k] === null && openedBefore[k] !== null)
        throw new Error(
          `Accountable: could not read the opening supply of ${pricedVaults[k]} on ${options.chain}`,
        );
      if (pricedPerfFees[k] === null)
        throw new Error(
          `Accountable: could not read the performance fee of ${strategies[priced[k]]} on ${options.chain}`,
        );
      // Only one of the two `managerSplit` overloads exists per generation, so
      // one null is expected here and two are a failed read.
      if (pricedSplits[k] === null && pricedLegacySplits[k] === null)
        throw new Error(
          `Accountable: could not read the manager split of ${strategies[priced[k]]} on ${options.chain}`,
        );

      const depositors = big(closeAssets[k]) - big(openAssets[k]);
      const gross = depositors + big(mintedAssets[k]);

      // The fee is booked as it accrues, from the rates the FeeManager holds
      // for the strategy, rather than when it crystallizes into minted shares.
      // The minted shares are therefore not authoritative for the split: a
      // looping vault can run for weeks against a configured performance fee
      // and manager split without minting once, and attributing from the mints
      // alone would report no revenue for it at all. Deriving both from the
      // rates also keeps this path on the same accrual basis as the credit one.
      const fee = (gross * big(pricedPerfFees[k])) / FEE_DENOMINATOR;
      const split = big(pricedSplits[k] ?? pricedLegacySplits[k]);
      const manager = (fee * split) / FEE_DENOMINATOR;
      book(token, gross, manager, fee - manager, METRIC.ASSETS_YIELDS);
    });
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Value earned by Accountable vaults over the day, read on chain: for credit vaults the interest accrued by borrowers, for NAV, looping and fixed-term vaults the increase in share price plus the fee shares minted out of it.",
  Revenue:
    "The Accountable protocol's share of the performance and management fees.",
  ProtocolRevenue:
    "The Accountable protocol's share of the performance and management fees.",
  SupplySideRevenue:
    "Value paid to vault depositors, plus the vault manager's share of the fees, which leaves the protocol and is not protocol revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.BORROW_INTEREST]:
      "Interest accrued by borrowers on drawn credit vault capital, before fees are taken out of it.",
    [METRIC.ASSETS_YIELDS]:
      "Yield accrued by NAV, looping and fixed-term vaults, measured as share price appreciation, before fees are taken out of it.",
  },
  Revenue: {
    [PROTOCOL]:
      "The Accountable protocol's share of the performance and management fees charged on vault earnings.",
  },
  ProtocolRevenue: {
    [PROTOCOL]:
      "The Accountable protocol's share of the performance and management fees charged on vault earnings.",
  },
  SupplySideRevenue: {
    [DEPOSITORS]:
      "Borrow interest or vault yield distributed to depositors, net of fees.",
    [MANAGER]:
      "The vault manager's share of the performance and management fees. The manager is an external party running the strategy, so this is a cost of funds rather than protocol revenue.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: config,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true, // vault prices can fall
};

export default adapter;

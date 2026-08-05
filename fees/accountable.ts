import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const FACTORIES: Record<string, string[]> = {
  [CHAIN.MONAD]: [
    "0x606556A6B544ecDcbf15aF73A63B67516dc16Ad7",
    "0x8a5Caf00C3EB20aEC11Fc35C153a8601Cd127fEd",
    "0x2f5CAc28cf80D465d7C8D67a49c8e36710a4B83B",
    "0x4927Ce3402035b801A1bEdDC498b7fb2fe9eA181",
    "0x9f1EB2be7b6a7e611c270bbdb0A3358786769518",
  ],
  [CHAIN.ETHEREUM]: [
    "0x333a12e2B519DA16EBE75012d54574C16ef4463f",
    "0xDAc0e7EffB16B249d1Bb672D25D7827481Be2081",
    "0x2A7F22f81A3d301b8f0EAf4f09a78558c91Fc69a",
    "0xB4082B8126AF8B5345CfB159AC5d4b4F05F54bC5",
    "0xC0f778b51bF9751BBccBF4e78A107026aDaDbe43",
  ],
  [CHAIN.BASE]: [
    "0x2A7F22f81A3d301b8f0EAf4f09a78558c91Fc69a",
    "0xB4082B8126AF8B5345CfB159AC5d4b4F05F54bC5",
    "0xC0f778b51bF9751BBccBF4e78A107026aDaDbe43",
  ],
  [CHAIN.ARBITRUM]: [
    "0x2A7F22f81A3d301b8f0EAf4f09a78558c91Fc69a",
    "0xB4082B8126AF8B5345CfB159AC5d4b4F05F54bC5",
    "0xC0f778b51bF9751BBccBF4e78A107026aDaDbe43",
    "0x333a12e2B519DA16EBE75012d54574C16ef4463f",
    "0xDAc0e7EffB16B249d1Bb672D25D7827481Be2081",
  ],
};

// aHYPER Looping Vault (vault 0x23b148d8f389C5821739381f1FF87bB7e1162566) is
// EOA-deployed rather than created by a registered factory, so enumeration
// cannot reach it. The TVL adapter carries the same exception.
const EXTRA_STRATEGIES: Record<string, string[]> = {
  [CHAIN.MONAD]: ["0xE19b272b2fe4a54103A41F9B1c65dB3D2F6d886D"],
};

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
  treasury: "function treasury() view returns (address)",
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
  borrowed: "event Borrowed(address indexed borrower, uint256 assets)",
  loanRepaid: "event LoanRepaid(uint256 assets)",
};

const PRECISION = 10n ** 36n;
const BASIS_POINTS = 1_000_000n;
const DEPOSITORS = "Earnings To Depositors";
const MANAGER = "Fees To Vault Manager";
const PROTOCOL = "Fees To Protocol";

const big = (v: any) => (v === null || v === undefined ? 0n : BigInt(v));

const listStrategies = async (api: any): Promise<string[]> => {
  const factories = FACTORIES[api.chain] || [];
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
  for (const s of EXTRA_STRATEGIES[api.chain] || []) seen.add(s.toLowerCase());
  return Array.from(seen);
};

const fetch = async (options: FetchOptions) => {
  const { fromApi, toApi, createBalances } = options;

  const strategies = await listStrategies(toApi);
  if (!strategies.length)
    return {
      dailyFees: createBalances(),
      dailyUserFees: createBalances(),
      dailySupplySideRevenue: createBalances(),
      dailyRevenue: createBalances(),
      dailyProtocolRevenue: createBalances(),
    };

  const [
    sfStart,
    sfEnd,
    loansStart,
    loansEnd,
    feeManagers,
    vaults,
    npStart,
    npEnd,
    delinqStart,
    penaltiesOn,
  ] = await Promise.all([
    fromApi.multiCall({
      abi: abis.scaleFactor,
      calls: strategies,
      permitFailure: true,
    }),
    toApi.multiCall({
      abi: abis.scaleFactor,
      calls: strategies,
      permitFailure: true,
    }),
    fromApi.multiCall({
      abi: abis.loan,
      calls: strategies,
      permitFailure: true,
    }),
    toApi.multiCall({ abi: abis.loan, calls: strategies, permitFailure: true }),
    toApi.multiCall({
      abi: abis.feeManager,
      calls: strategies,
      permitFailure: true,
    }),
    toApi.multiCall({
      abi: abis.vault,
      calls: strategies,
      permitFailure: true,
    }),
    fromApi.multiCall({
      abi: abis.netPrincipal,
      calls: strategies,
      permitFailure: true,
    }),
    toApi.multiCall({
      abi: abis.netPrincipal,
      calls: strategies,
      permitFailure: true,
    }),
    toApi.multiCall({
      abi: abis.delinquencyStartTime,
      calls: strategies,
      permitFailure: true,
    }),
    toApi.multiCall({
      abi: abis.penaltiesEnabled,
      calls: strategies,
      permitFailure: true,
    }),
  ]);

  const lending: number[] = [];
  const priced: number[] = [];
  strategies.forEach((_, i) => {
    if (!vaults[i]) return;
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
    if (interest <= 0n) return;
    const depositors = interest - manager - protocol;
    dailyFees.add(token, interest, metric);
    if (depositors > 0n)
      dailySupplySideRevenue.add(token, depositors, DEPOSITORS);
    if (manager > 0n) dailySupplySideRevenue.add(token, manager, MANAGER);
    if (protocol > 0n) dailyProtocolRevenue.add(token, protocol, PROTOCOL);
  };

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

    return (
      (base * (rate * elapsed * DAY + penalty * penaltySeconds * YEAR)) /
      (YEAR * DAY * BASIS_POINTS)
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
    .filter((s) => s.interest > 0n);

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

    const [assets, perfFees, mgmtFees, perfSplits, mgmtSplits, legacySplits] =
      await Promise.all([
        toApi.multiCall({
          abi: abis.asset,
          calls: active.map((a) => vaults[a.i]),
          permitFailure: true,
        }),
        fmCall(abis.performanceFee),
        fmCall(abis.managementFee),
        fmCall(abis.managerSplit, true),
        fmCall(abis.managerSplit, false),
        fmCall(abis.managerSplitLegacy),
      ]);

    active.forEach((a, k) => {
      const token = assets[k];
      if (!token)
        throw new Error(
          `Accountable: could not read the asset of ${strategies[a.i]} on ${options.chain}`,
        );

      const perfFee = (a.interest * big(perfFees[k])) / BASIS_POINTS;
      const mgmtFee =
        (a.aum * big(mgmtFees[k]) * elapsed) / (YEAR * BASIS_POINTS);
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
        (perfPart * perfSplit) / BASIS_POINTS +
        (mgmtPart * mgmtSplit) / BASIS_POINTS;

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
    const [supply0, assetAddrs, treasuries, mintLogs] = await Promise.all([
      fromApi.multiCall({
        abi: abis.totalSupply,
        calls: pricedVaults,
        permitFailure: true,
      }),
      toApi.multiCall({
        abi: abis.asset,
        calls: pricedVaults,
        permitFailure: true,
      }),
      toApi.multiCall({
        abi: abis.treasury,
        calls: priced.map((i) => feeManagers[i]),
        permitFailure: true,
      }),
      options.getLogs({
        targets: priced.map((i) => strategies[i]),
        eventAbi: abis.feeSharesMinted,
        entireLog: true,
        parseLog: true,
      }),
    ]);

    const mintedByStrategy: Record<
      string,
      { recipient: string; shares: bigint }[]
    > = {};
    for (const log of mintLogs || []) {
      const key = log.address.toLowerCase();
      (mintedByStrategy[key] ||= []).push({
        recipient: String(log.args.recipient).toLowerCase(),
        shares: BigInt(log.args.shares),
      });
    }

    const shareSplit = priced.map((i, k) => {
      const treasury = String(treasuries[k] || "").toLowerCase();
      let protocolShares = 0n;
      let managerShares = 0n;
      for (const m of mintedByStrategy[strategies[i]] || []) {
        if (treasury && m.recipient === treasury) protocolShares += m.shares;
        else managerShares += m.shares;
      }
      return { protocolShares, managerShares };
    });

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

    const [
      openAssets,
      closeAssets,
      protocolAssets,
      managerAssets,
      pricedPerfFees,
      pricedSplits,
      pricedLegacySplits,
    ] = await Promise.all([
      fromApi.multiCall({
        abi: abis.convertToAssets,
        calls: pricedVaults.map((v, k) => ({
          target: v,
          params: [supply0[k] || 0],
        })),
        permitFailure: true,
      }),
      toApi.multiCall({
        abi: abis.convertToAssets,
        calls: pricedVaults.map((v, k) => ({
          target: v,
          params: [supply0[k] || 0],
        })),
        permitFailure: true,
      }),
      toApi.multiCall({
        abi: abis.convertToAssets,
        calls: pricedVaults.map((v, k) => ({
          target: v,
          params: [shareSplit[k].protocolShares.toString()],
        })),
        permitFailure: true,
      }),
      toApi.multiCall({
        abi: abis.convertToAssets,
        calls: pricedVaults.map((v, k) => ({
          target: v,
          params: [shareSplit[k].managerShares.toString()],
        })),
        permitFailure: true,
      }),
      pricedFmCall(abis.performanceFee),
      pricedFmCall(abis.managerSplit, true),
      pricedFmCall(abis.managerSplitLegacy),
    ]);

    priced.forEach((_, k) => {
      const token = assetAddrs[k];
      if (!token)
        throw new Error(
          `Accountable: could not read the asset of ${strategies[priced[k]]} on ${options.chain}`,
        );
      const depositors = big(closeAssets[k]) - big(openAssets[k]);
      const gross =
        (depositors > 0n ? depositors : 0n) +
        big(protocolAssets[k]) +
        big(managerAssets[k]);

      const fee = (gross * big(pricedPerfFees[k])) / BASIS_POINTS;
      const split = big(pricedSplits[k] ?? pricedLegacySplits[k]);
      const manager = (fee * split) / BASIS_POINTS;
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
  // Vault value is read at the window boundaries and the accrual scales with the
  // elapsed time, so an hourly window is arithmetically fine, but NAV vaults only
  // reprice when the DVN publishes (median 24h), which would leave most hours at
  // zero and spike the rest.
  pullHourly: false,
  adapter: {
    [CHAIN.MONAD]: { start: "2025-11-27" },
    [CHAIN.ETHEREUM]: { start: "2026-01-16" },
    [CHAIN.BASE]: { start: "2026-04-23" },
    [CHAIN.ARBITRUM]: { start: "2026-05-19" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;

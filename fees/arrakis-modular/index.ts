import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from "../../helpers/coreAssets.json";

// ArrakisMetaVaultFactory, same address on every chain Arrakis Modular is deployed to.
const FACTORY = "0x820FB8127a689327C863de8433278d6181123982";

// Arrakis denominates the manager fee share in PIPS (1e6 = 100%).
const PIPS = 1_000_000n;

const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

const abis = {
  numOfPublicVaults: "uint256:numOfPublicVaults",
  numOfPrivateVaults: "uint256:numOfPrivateVaults",
  publicVaults:
    "function publicVaults(uint256 startIndex_, uint256 endIndex_) view returns (address[])",
  privateVaults:
    "function privateVaults(uint256 startIndex_, uint256 endIndex_) view returns (address[])",
  module: "address:module",
  token0: "address:token0",
  token1: "address:token1",
  managerFeePIPS: "uint256:managerFeePIPS",
};

// Every Arrakis LP module emits this whenever the manager fee is actually taken out of
// the position, which happens on rebalance, on withdraw and on withdrawManagerBalance().
// Amounts are always emitted in token0/token1 order (the module un-inverses them first).
const MANAGER_FEE_EVENT =
  "event LogWithdrawManagerBalance(address manager, uint256 amount0, uint256 amount1)";

// managerFeePIPS is mutable, so a rate change inside the window would make a single
// end-of-window snapshot the wrong divisor for every event emitted before it. This event
// carries both sides of each change, which lets each withdrawal be matched to the rate
// that was actually in force when it was emitted.
const FEE_RATE_EVENT =
  "event LogSetManagerFeePIPS(uint256 oldFee, uint256 newFee)";

type ModuleEvent =
  | { block: number; logIndex: number; kind: "fee"; amounts: bigint[] }
  | { block: number; logIndex: number; kind: "rate"; oldFee: bigint; newFee: bigint };

const toToken = (token: string) =>
  token.toLowerCase() === NATIVE ? ADDRESSES.null : token;

const fetch = async (options: FetchOptions) => {
  const { api, fromApi, createBalances, getLogs } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const result = {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };

  const [numPublic, numPrivate] = await Promise.all([
    api.call({ target: FACTORY, abi: abis.numOfPublicVaults }),
    api.call({ target: FACTORY, abi: abis.numOfPrivateVaults }),
  ]);

  const [publicVaults, privateVaults] = await Promise.all([
    numPublic > 0
      ? api.call({ target: FACTORY, abi: abis.publicVaults, params: [0, numPublic] })
      : [],
    numPrivate > 0
      ? api.call({ target: FACTORY, abi: abis.privateVaults, params: [0, numPrivate] })
      : [],
  ]);

  const vaults: string[] = [...publicVaults, ...privateVaults];
  if (!vaults.length) return result;

  const modules: string[] = await api.multiCall({ abi: abis.module, calls: vaults });

  const [token0s, token1s, feePIPSAtWindowStart, feeLogs, rateLogs] = await Promise.all([
    api.multiCall({ abi: abis.token0, calls: modules }),
    api.multiCall({ abi: abis.token1, calls: modules }),
    fromApi.multiCall({ abi: abis.managerFeePIPS, calls: modules }),
    getLogs({
      targets: modules,
      eventAbi: MANAGER_FEE_EVENT,
      entireLog: true,
      parseLog: true,
    }),
    getLogs({
      targets: modules,
      eventAbi: FEE_RATE_EVENT,
      entireLog: true,
      parseLog: true,
    }),
  ]);

  const moduleInfo: Record<string, { tokens: string[]; startFeePIPS: bigint }> = {};
  modules.forEach((module: string, i: number) => {
    moduleInfo[module.toLowerCase()] = {
      tokens: [toToken(token0s[i]), toToken(token1s[i])],
      startFeePIPS: BigInt(feePIPSAtWindowStart[i]),
    };
  });

  const eventsByModule: Record<string, ModuleEvent[]> = {};
  const push = (address: string, event: ModuleEvent) => {
    const key = address.toLowerCase();
    if (!moduleInfo[key]) return;
    (eventsByModule[key] ??= []).push(event);
  };

  for (const log of feeLogs) {
    push(log.address, {
      block: Number(log.blockNumber),
      logIndex: Number(log.logIndex),
      kind: "fee",
      amounts: [BigInt(log.args.amount0), BigInt(log.args.amount1)],
    });
  }

  for (const log of rateLogs) {
    push(log.address, {
      block: Number(log.blockNumber),
      logIndex: Number(log.logIndex),
      kind: "rate",
      oldFee: BigInt(log.args.oldFee),
      newFee: BigInt(log.args.newFee),
    });
  }

  for (const [module, events] of Object.entries(eventsByModule)) {
    const info = moduleInfo[module];

    events.sort((a, b) => a.block - b.block || a.logIndex - b.logIndex);

    // Rate in force before the first event of the window. setManagerFeePIPS() flushes the
    // outstanding manager balance in the same transaction, emitting the withdrawal at a
    // lower log index than the rate change itself, so replaying both streams in log order
    // is what actually resolves each withdrawal to its own rate. Where the window contains
    // a rate change, its oldFee is authoritative for everything ahead of it and is used in
    // preference to the fromApi read, which would be wrong for a change landing on the
    // window's first block.
    const firstRateChange = events.find((event) => event.kind === "rate");
    let feePIPS =
      firstRateChange && firstRateChange.kind === "rate"
        ? firstRateChange.oldFee
        : info.startFeePIPS;

    for (const event of events) {
      if (event.kind === "rate") {
        feePIPS = event.newFee;
        continue;
      }

      event.amounts.forEach((managerFee, i) => {
        if (managerFee === 0n) return;
        const token = info.tokens[i];

        dailyRevenue.add(token, managerFee, METRIC.MANAGEMENT_FEES);

        // The module computes the emitted amount as grossFees * managerFeePIPS / PIPS at
        // the moment fees leave the position, so the gross figure is recovered by
        // inverting that with the rate resolved above. A zero rate cannot produce a non
        // zero manager fee, but guard the division anyway and keep
        // dailyFees = dailyRevenue + dailySupplySideRevenue if it ever happens.
        const grossFees = feePIPS > 0n ? (managerFee * PIPS) / feePIPS : managerFee;

        dailyFees.add(token, grossFees, METRIC.LP_FEES);
        dailySupplySideRevenue.add(token, grossFees - managerFee, "LP Fees To Depositors");
      });
    }
  }

  return result;
};

const methodology = {
  Fees: "Gross trading fees earned by all Arrakis Modular vault positions, recovered from the manager fee actually taken out of each position and the manager fee share that was in force for that vault at the moment the fee was taken.",
  Revenue: "Manager fee taken by Arrakis out of the trading fees earned by vault positions.",
  ProtocolRevenue: "Same as Revenue, the manager fee is paid to the Arrakis manager.",
  SupplySideRevenue: "Trading fees left to vault depositors after the manager fee.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "Trading fees accrued to Arrakis Modular vault positions.",
  },
  Revenue: {
    [METRIC.MANAGEMENT_FEES]: "Manager fee share of vault trading fees.",
  },
  ProtocolRevenue: {
    [METRIC.MANAGEMENT_FEES]: "Manager fee share of vault trading fees.",
  },
  SupplySideRevenue: {
    "LP Fees To Depositors": "Trading fees remaining with depositors after the manager fee.",
  },
};

const adapter: Adapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2024-08-16" },
    [CHAIN.BASE]: { start: "2024-08-16" },
    [CHAIN.ARBITRUM]: { start: "2024-08-16" },
    [CHAIN.BSC]: { start: "2025-05-15" },
    [CHAIN.PLASMA]: { start: "2025-11-21" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;

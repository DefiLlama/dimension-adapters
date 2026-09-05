import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { ChainApi } from "@defillama/sdk";

/**
 * Umbrae runs two AMM designs on Base:
 *
 *  - DLMM: a Liquidity Book style discrete-bin concentrated-liquidity AMM. Two
 *    generations are live. The original factory is now paused for trading (its
 *    pairs remain open for LP withdrawals) but carries the protocol's swap
 *    history, so it stays in the adapter for backfill. The v2 factory takes
 *    current traffic. Both implementations emit the same `SwapDetailed` event.
 *  - DAMM: a dynamic-fee constant-product AMM.
 *
 * All three factories expose the same enumeration surface
 * (`allPairsLength()` / `allPairs(uint256)`) and their pairs expose
 * `tokenX()` / `tokenY()`.
 */
// `fromBlock` is each factory's own deployment block. Backfills run at
// historical blocks where a later factory does not exist yet, and calling
// `allPairsLength()` on an empty address reverts, so factories are filtered by
// block before they are queried.
// Factory sources:
// https://basescan.org/address/0x17Da44dcbdffD8c715be7A368E19F252C2940Fee#code
// https://basescan.org/address/0x9DBB9289d0D75508b5D8EE01FfE4eb7c412F733b#code
// https://basescan.org/address/0xD14322b444415d78DBBF646BB369Ec325a1aCD5c#code
// Deployment blocks are the factories' creation transactions on Basescan.
const DLMM_FACTORIES = [
  { factory: "0x17Da44dcbdffD8c715be7A368E19F252C2940Fee", fromBlock: 43528312 }, // original deployment (paused for trading, LP withdrawals only)
  { factory: "0x9DBB9289d0D75508b5D8EE01FfE4eb7c412F733b", fromBlock: 50392460 }, // v2
];
const DAMM_FACTORIES = [
  { factory: "0xD14322b444415d78DBBF646BB369Ec325a1aCD5c", fromBlock: 45693740 }, // v4
];

// DLMM reports the fee split on every swap, so no rate needs to be assumed:
// `totalFee` == `protocolFee` + `lpFee`, all denominated in the swap's INPUT
// token (tokenX when swapForY, otherwise tokenY).
const DLMM_SWAP_EVENT =
  "event SwapDetailed(address indexed sender, address indexed recipient, uint256 amountIn, uint256 amountOut, uint24 startBinId, uint24 endBinId, uint256 binsTraversed, uint256 totalFee, uint256 protocolFee, uint256 lpFee, bool swapForY)";

// DAMM's Swap event is used only for volume. Accumulator changes plus claims
// recover exact fees without inverting a rounded output or assuming a fee rate.
const DAMM_SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, uint256 amountXIn, uint256 amountYIn, uint256 amountXOut, uint256 amountYOut, uint16 feeBps)";

const abi = {
  allPairsLength: "uint256:allPairsLength",
  allPairs: "function allPairs(uint256) view returns (address)",
  tokenX: "address:tokenX",
  tokenY: "address:tokenY",
  feeToken: "address:feeToken",
  protocolFees: "uint256:protocolFeesAccumulated",
  lpFees: "uint256:lpFeesAccumulated",
};

// Immutable U1TokenLockVault; RewardsAdded credits WETH to U1 lockers.
// https://basescan.org/address/0xf771F202e8B49612e83f18B68D6b268765A40F72#code
const U1_LOCK_VAULT = "0xf771F202e8B49612e83f18B68D6b268765A40F72";

const SWAP_VOLUME = "Swap Volume";
const SWAP_FEES_TO_LPS = "Swap Fees To LPs";
const SWAP_FEES_TO_PROTOCOL = "Swap Fees To Protocol";
const LOCKER_REWARDS = "U1 Locker Distributions";

type ClaimLog = { blockNumber: number; logIndex: number; args: { amount: bigint; feeToken?: string } };

/**
 * Enumerate only factories deployed at the snapshot (read-only RPC).
 * @param api Snapshot-bound SDK client.
 * @param factories Factory addresses with deployment blocks.
 * @param block Snapshot block used to exclude undeployed factories.
 * @returns Pool addresses available at that snapshot.
 */
async function listPairs(
  api: ChainApi,
  factories: { factory: string; fromBlock: number }[],
  block: number,
): Promise<string[]> {
  const deployed = factories.filter((f) => block >= f.fromBlock);
  if (!deployed.length) return [];
  return api.fetchList({ targets: deployed.map(({ factory }) => factory), lengthAbi: abi.allPairsLength, itemAbi: abi.allPairs });
}

/**
 * Read swap accrual and separately funded holder distributions for one window.
 * @param options Native SDK snapshots, log bounds and balance factory.
 * @returns Volume, fees, gross treasury accrual, LP income and holder funding.
 */
const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  if (!Number.isInteger(fromBlock) || !Number.isInteger(toBlock) || fromBlock <= 0 || toBlock <= fromBlock)
    throw new Error("Umbrae: invalid block window");
  // SDK log bounds are inclusive. Exclude the previous window's final block.
  const logWindow = { fromBlock: fromBlock + 1, toBlock };
  const dlmmPairs = await listPairs(options.api, DLMM_FACTORIES, toBlock);
  const dammPairs = await listPairs(options.api, DAMM_FACTORIES, toBlock);

  // ---------------------------------------------------------------- DLMM ----
  if (dlmmPairs.length) {
    const tokenX = await options.api.multiCall({ abi: abi.tokenX, calls: dlmmPairs });
    const tokenY = await options.api.multiCall({ abi: abi.tokenY, calls: dlmmPairs });
    const logsByPair = await options.getLogs({ targets: dlmmPairs, eventAbi: DLMM_SWAP_EVENT, flatten: false, ...logWindow });

    dlmmPairs.forEach((_, i) => {
      logsByPair[i].forEach((log: { swapForY: boolean; amountIn: bigint; totalFee: bigint; lpFee: bigint; protocolFee: bigint }) => {
        // Fees are charged on the way in, so they are denominated in the input token.
        const tokenIn = log.swapForY ? tokenX[i] : tokenY[i];
        if (BigInt(log.totalFee) !== BigInt(log.lpFee) + BigInt(log.protocolFee))
          throw new Error("Umbrae: DLMM swap fee split does not balance");

        dailyVolume.add(tokenIn, log.amountIn, SWAP_VOLUME);
        dailyFees.add(tokenIn, log.totalFee, METRIC.SWAP_FEES);
        dailyUserFees.add(tokenIn, log.totalFee, METRIC.SWAP_FEES);
        dailySupplySideRevenue.add(tokenIn, log.lpFee, SWAP_FEES_TO_LPS);
        dailyRevenue.add(tokenIn, log.protocolFee, SWAP_FEES_TO_PROTOCOL);
      });
    });
  }

  // ---------------------------------------------------------------- DAMM ----
  if (dammPairs.length) {
    const tokenX = await options.api.multiCall({ abi: abi.tokenX, calls: dammPairs });
    const tokenY = await options.api.multiCall({ abi: abi.tokenY, calls: dammPairs });
    const feeToken = await options.api.multiCall({ abi: abi.feeToken, calls: dammPairs });
    const protocolFees = await options.api.multiCall({ abi: abi.protocolFees, calls: dammPairs });
    const lpFees = await options.api.multiCall({ abi: abi.lpFees, calls: dammPairs });
    const oldPairs = await listPairs(options.fromApi, DAMM_FACTORIES, fromBlock);
    const oldFeeToken = await options.fromApi.multiCall({ abi: abi.feeToken, calls: oldPairs });
    const oldProtocolFees = await options.fromApi.multiCall({ abi: abi.protocolFees, calls: oldPairs });
    const oldLpFees = await options.fromApi.multiCall({ abi: abi.lpFees, calls: oldPairs });
    const logsByPair = await options.getLogs({ targets: dammPairs, eventAbi: DAMM_SWAP_EVENT, flatten: false, ...logWindow });
    const protocolClaims = await options.getLogs({ targets: dammPairs, eventAbi: "event ProtocolFeesClaimed(address indexed recipient, uint256 amount)", flatten: false, entireLog: true, parseLog: true, ...logWindow });
    const lpClaims = await options.getLogs({ targets: dammPairs, eventAbi: "event LPFeesClaimed(address indexed holder, address indexed recipient, uint256 amount)", flatten: false, entireLog: true, parseLog: true, ...logWindow });
    const tokenChanges = await options.getLogs({ targets: dammPairs, eventAbi: "event FeeTokenUpdated(address indexed feeToken)", flatten: false, entireLog: true, parseLog: true, ...logWindow });

    dammPairs.forEach((pair, i) => {
      const oldIndex = oldPairs.findIndex(old => old.toLowerCase() === pair.toLowerCase());
      // Initialization emits no fee token, and updates may repeat the same token.
      // A new pair starts at zero; every update also requires drained accumulators.
      // Only nonzero claims before its first update need the unknown initial token.
      let currentToken: string | undefined = oldIndex === -1 && tokenChanges[i].length
        ? undefined : (oldIndex === -1 ? feeToken[i] : oldFeeToken[oldIndex]).toLowerCase();
      const accrued: Record<string, { protocol: bigint; lp: bigint }> = currentToken ? {
        [currentToken]: { protocol: oldIndex === -1 ? 0n : -BigInt(oldProtocolFees[oldIndex]), lp: oldIndex === -1 ? 0n : -BigInt(oldLpFees[oldIndex]) },
      } : {};
      const events: (ClaimLog & { kind: "protocol" | "lp" | "token" })[] = [
        ...protocolClaims[i].map((log: ClaimLog) => ({ ...log, kind: "protocol" as const })),
        ...lpClaims[i].map((log: ClaimLog) => ({ ...log, kind: "lp" as const })),
        ...tokenChanges[i].map((log: ClaimLog) => ({ ...log, kind: "token" as const })),
      ];
      events.sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex);
      for (const log of events) {
        if (log.kind === "token") {
          currentToken = log.args.feeToken!.toLowerCase();
          accrued[currentToken] ??= { protocol: 0n, lp: 0n };
        } else {
          const amount = BigInt(log.args.amount);
          if (amount === 0n) continue;
          if (!currentToken)
            throw new Error("Umbrae: nonzero DAMM claims before a new pair's first fee-token update require initialization history");
          accrued[currentToken][log.kind] += amount;
        }
      }
      if (!currentToken || currentToken !== feeToken[i].toLowerCase())
        throw new Error("Umbrae: DAMM fee-token history does not match its ending state");
      accrued[currentToken].protocol += BigInt(protocolFees[i]);
      accrued[currentToken].lp += BigInt(lpFees[i]);

      logsByPair[i].forEach((log: { amountXIn: bigint; amountYIn: bigint }) => {
        const xToY = BigInt(log.amountXIn) > 0n;
        const tokenIn = xToY ? tokenX[i] : tokenY[i];
        const amountIn = xToY ? BigInt(log.amountXIn) : BigInt(log.amountYIn);
        dailyVolume.add(tokenIn, amountIn, SWAP_VOLUME);
      });

      // Only swap accrual increases these accumulators; claims decrease them.
      // https://basescan.org/address/0x1d8752A8533668FBC49E4721790592f3111A3D0A#code
      for (const [pairFeeToken, { protocol: protocolCut, lp: lpCut }] of Object.entries(accrued)) {
        if (protocolCut < 0n || lpCut < 0n)
          throw new Error("Umbrae: DAMM fee accrual is negative; claim history or accounting changed");
        const feeAmount = protocolCut + lpCut;
        dailyFees.add(pairFeeToken, feeAmount, METRIC.SWAP_FEES);
        dailyUserFees.add(pairFeeToken, feeAmount, METRIC.SWAP_FEES);
        dailySupplySideRevenue.add(pairFeeToken, lpCut, SWAP_FEES_TO_LPS);
        dailyRevenue.add(pairFeeToken, protocolCut, SWAP_FEES_TO_PROTOCOL);
      }
    });
  }

  const rewards = await options.getLogs({ target: U1_LOCK_VAULT, eventAbi: "event RewardsAdded(address indexed funder, uint256 amount, uint256 newRewardIndex)", ...logWindow });
  if (rewards.length) {
    const rewardToken = await options.api.call({ target: U1_LOCK_VAULT, abi: "address:rewardToken" });
    for (const reward of rewards) dailyHoldersRevenue.add(rewardToken, reward.amount, LOCKER_REWARDS);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Sum of the input amount of every swap on Umbrae's DLMM (Liquidity Book style concentrated liquidity) and DAMM (dynamic-fee constant product) pools on Base. Pools are enumerated on chain from their factories and volume is read from each pool's swap events.",
  Fees: "Swap fees on the listed DLMM and DAMM factories only; excludes aggregator, keeper, flash-loan and liquidity-composition fees. DLMM uses SwapDetailed; DAMM uses changes in protocol and LP fee accumulators plus claims, in each historical fee token.",
  Revenue: "The protocol's share of swap fees, which accrues to the protocol fee recipient.",
  ProtocolRevenue: "Gross protocol swap-fee share accruing to the fee treasury, before later discretionary distributions. This is the same accrual as Revenue, not net retained income after holder allocations.",
  HoldersRevenue: "Actual WETH distributions credited to U1 lockers by RewardsAdded, including external funding. These can occur after swap revenue accrues and are not added again to Revenue. No fixed forwarding percentage or net retained share is assumed.",
  SupplySideRevenue: "The share of swap fees that accrues to liquidity providers.",
  UserFees: "Swap fees paid by traders, which is the whole of Fees.",
};

const breakdownMethodology = {
  Volume: {
    [SWAP_VOLUME]: "Input amount of every swap through Umbrae DLMM and DAMM pools.",
  },
  Fees: {
    [METRIC.SWAP_FEES]: "Total swap fees charged by Umbrae DLMM and DAMM pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Total swap fees charged by Umbrae DLMM and DAMM pools, all of which is paid by traders.",
  },
  Revenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Protocol share of swap fees.",
  },
  ProtocolRevenue: {
    [SWAP_FEES_TO_PROTOCOL]: "Gross swap-fee accrual to the fee treasury before discretionary holder allocations; not net retained income.",
  },
  HoldersRevenue: {
    [LOCKER_REWARDS]: "WETH credited to U1 lockers at funding time, not again when users claim it.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_LPS]: "Liquidity provider share of swap fees.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-03-18", // Base block 43528312, first DLMM factory deployment
  methodology,
  breakdownMethodology,
};

export default adapter;

import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { nullAddress } from "../helpers/token";

// Umia protocol contracts on Base: https://github.com/umiafinance/protocol
const HUB = "0x120dbCDd58Bb787309573e29159fE6D37A1983F6";
// Uniswap v4 PoolManager on Base: https://docs.uniswap.org/contracts/v4/deployments
const POOL_MANAGER = "0x498581fF718922c3f8e6A244956aF099B2652b2b";
const SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";

const BPS_DENOM = 10000;
// Uniswap v4 reports the LP fee in hundredths of a bip (1_000_000 = 100%)
const PIPS_DENOM = 1e6;

const ABI = {
  ventureCount: "uint256:ventureCount",
  ventureById:
    "function ventureById(uint256) view returns (tuple(uint256 id, address venture, string name, uint256 createdAt))",
  ventureVault: "function ventureLiquidityVault(address) view returns (address)",
  marketCore: "address:umiaMarketCore",
  protocolFeeRecipient: "address:protocolFeeRecipient",
  spotProtocolFeeCutBps: "function spotProtocolFeeCutBps() view returns (uint16)",
  decisionProtocolFeeCutBps: "function decisionProtocolFeeCutBps() view returns (uint16)",
  poolKey:
    "function getPoolKey() view returns ((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks))",
  shareBalance: "function shareBalance(address) view returns (uint256)",
  totalShares: "uint256:totalShares",
  token: "address:token",
  moneyToken: "address:moneyToken",
  marketInfo:
    "function marketInfo(uint256) view returns (uint256 id, uint256 ventureId, uint256 tradingStart, uint256 tradingEnd)",
};

const SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)";
const PROTOCOL_FEES_COLLECTED =
  "event ProtocolFeesCollected(uint256 indexed marketId, address indexed feeRecipient, uint256 feeVenture, uint256 feeMoney)";

const LABEL = {
  SPOT_FEES: METRIC.SWAP_FEES,
  SPOT_PROTOCOL: "Spot protocol fee",
  SPOT_POL: "Spot LP fees on protocol-owned vault shares",
  SPOT_LP: "Spot LP fees (venture vault)",
  DM_FEES: "Decision market swap fees",
  DM_PROTOCOL: "Decision market protocol fee",
  DM_POL: "Decision market LP fees on protocol-owned vault shares",
  DM_LP: "Decision market LP fees (venture vault)",
};

/**
 * PoolIdLibrary.toId() is keccak256 over the five 32-byte PoolKey slots.
 * The vault caches the id in an immutable with no getter, so it is derived here.
 */
function poolKeyToId(poolKey: any): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint24", "int24", "address"],
      [poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing, poolKey.hooks],
    ),
  );
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const result = {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue: 0,
  };

  const count = Number(await options.api.call({ target: HUB, abi: ABI.ventureCount }));
  if (!count) return result;

  const infos = await options.api.multiCall({
    target: HUB,
    abi: ABI.ventureById,
    calls: Array.from({ length: count }, (_, i) => i + 1),
  });
  const [marketCore, recipient, spotCutBps, decisionCutBps] = await options.api.batchCall([
    { target: HUB, abi: ABI.marketCore },
    { target: HUB, abi: ABI.protocolFeeRecipient },
    { target: HUB, abi: ABI.spotProtocolFeeCutBps },
    { target: HUB, abi: ABI.decisionProtocolFeeCutBps },
  ]);

  const ventures = infos.filter((info: any) => info?.venture && info.venture !== nullAddress);
  const addresses = ventures.map((info: any) => info.venture);
  const vaults: string[] = await options.api.multiCall({
    abi: ABI.ventureVault,
    calls: addresses.map((venture: string) => ({ target: HUB, params: [venture] })),
  });
  const ventureTokens: string[] = await options.api.multiCall({ abi: ABI.token, calls: addresses });
  const moneyTokens: string[] = await options.api.multiCall({ abi: ABI.moneyToken, calls: addresses });

  const liveVaults = vaults
    .map((vault: string, i: number) => ({ vault, i }))
    .filter(({ vault }) => vault && vault !== nullAddress);
  const poolKeys = liveVaults.length
    ? await options.api.multiCall({ abi: ABI.poolKey, calls: liveVaults.map(({ vault }) => vault) })
    : [];

  const hasRecipient = recipient && recipient !== nullAddress;
  const spotCut = hasRecipient ? Number(spotCutBps) : 0;
  const decisionCut = hasRecipient ? Number(decisionCutBps) : 0;

  const byVenture = new Map<number, {
    moneyToken: string;
    ventureToken: string;
    poolId: string | null;
    moneyIsCurrency0: boolean;
    polShare: number;
  }>();
  const byPoolId = new Map<string, number>();
  const poolKeyByVentureIndex = new Map<number, any>();
  liveVaults.forEach(({ i }, j) => poolKeyByVentureIndex.set(i, poolKeys[j]));

  for (const [i, info] of ventures.entries()) {
    const poolKey = poolKeyByVentureIndex.get(i);
    const poolId = poolKey ? poolKeyToId(poolKey).toLowerCase() : null;
    const id = Number(info.id);
    byVenture.set(id, {
      moneyToken: moneyTokens[i],
      ventureToken: ventureTokens[i],
      poolId,
      moneyIsCurrency0: poolKey ? poolKey.currency0.toLowerCase() === moneyTokens[i].toLowerCase() : true,
      polShare: 0,
    });
    if (poolId) byPoolId.set(poolId, id);
  }

  if (hasRecipient && liveVaults.length) {
    const shareResults = await options.api.batchCall(
      liveVaults.flatMap(({ vault }) => [
        { target: vault, abi: ABI.shareBalance, params: [recipient] },
        { target: vault, abi: ABI.totalShares },
      ]),
    );
    liveVaults.forEach(({ i }, j) => {
      const held = Number(shareResults[j * 2]);
      const total = Number(shareResults[j * 2 + 1]);
      const v = byVenture.get(Number(ventures[i].id))!;
      v.polShare = total ? Math.min(1, held / total) : 0;
    });
  }

  const addVault = (token: string, amount: number, polShare: number, polLabel: string, lpLabel: string) => {
    const pol = amount * polShare;
    dailyRevenue.add(token, pol, polLabel);
    dailySupplySideRevenue.add(token, amount - pol, lpLabel);
  };

  // One getLogs per pool id so topic1 hits the indexer; an OR of every id on
  // PoolManager scans all Base Uniswap v4 Swap logs and times out.
  for (const [poolId, ventureId] of byPoolId) {
    const v = byVenture.get(ventureId)!;
    const logs = await options.getLogs({
      target: POOL_MANAGER,
      eventAbi: SWAP_EVENT,
      topics: [SWAP_TOPIC, poolId],
    });
    for (const log of logs) {
      const moneyDelta = Number(v.moneyIsCurrency0 ? log.amount0 : log.amount1);
      dailyVolume.add(v.moneyToken, Math.abs(moneyDelta));

      const rate = Number(log.fee) / PIPS_DENOM;
      if (!rate || rate >= 1) continue;
      // v4 Swap amounts are the swapper's deltas; the negative leg is input. When
      // money is the output, fee at the realised price is out * rate / (1 - rate).
      const fee = moneyDelta < 0 ? Math.abs(moneyDelta) * rate : (moneyDelta * rate) / (1 - rate);
      const protocolCut = (fee * spotCut) / BPS_DENOM;
      dailyFees.add(v.moneyToken, fee, LABEL.SPOT_FEES);
      dailyRevenue.add(v.moneyToken, protocolCut, LABEL.SPOT_PROTOCOL);
      addVault(v.moneyToken, fee - protocolCut, v.polShare, LABEL.SPOT_POL, LABEL.SPOT_LP);
    }
  }

  if (marketCore && marketCore !== nullAddress && decisionCut) {
    const logs = await options.getLogs({ target: marketCore, eventAbi: PROTOCOL_FEES_COLLECTED });
    if (logs.length) {
      const marketIds = logs.map((log: any) => BigInt(log.marketId).toString());
      const marketInfos = await options.api.multiCall({
        target: marketCore,
        abi: ABI.marketInfo,
        calls: marketIds,
      });
      for (const [i, log] of logs.entries()) {
        const v = byVenture.get(Number(marketInfos[i].ventureId));
        if (!v) continue;
        const book = (token: string, cut: number) => {
          if (!cut) return;
          const total = (cut * BPS_DENOM) / decisionCut;
          dailyFees.add(token, total, LABEL.DM_FEES);
          dailyRevenue.add(token, cut, LABEL.DM_PROTOCOL);
          addVault(token, total - cut, v.polShare, LABEL.DM_POL, LABEL.DM_LP);
        };
        book(v.moneyToken, Number(log.feeMoney));
        book(v.ventureToken, Number(log.feeVenture));
      }
    }
  }

  return result;
};

const FEE_LABELS = {
  [LABEL.SPOT_FEES]: "Swap fee on each venture's Uniswap v4 spot pool, taken on the gross input of each swap and measured on the money-token leg.",
  [LABEL.DM_FEES]: "Fees of the winning proposal in a settled decision market, recognised when its protocol cut is collected.",
};

const REVENUE_LABELS = {
  [LABEL.SPOT_PROTOCOL]: "Protocol cut of spot swap fees, from spotProtocolFeeCutBps on the hub.",
  [LABEL.SPOT_POL]: "The LP half of spot swap fees on the vault shares held by the protocol fee recipient.",
  [LABEL.DM_PROTOCOL]: "Protocol cut of the winning proposal's decision-market fees, from decisionProtocolFeeCutBps on the hub, recognised when collected after settlement.",
  [LABEL.DM_POL]: "The LP half of the winning proposal's decision-market fees on the vault shares held by the protocol fee recipient.",
};

const adapter: SimpleAdapter = {
  version: 2,
  //pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-08-20",
  methodology: {
    Fees: "Swap fees on each venture's Uniswap v4 spot pool, booked in the money token at each swap's realised price, plus the fees of the winning proposal in each decision market, recognised when its protocol cut is collected after settlement. Fees paid on losing proposals never become real tokens and are not counted.",
    UserFees: "Identical to Fees. Traders pay the swap fee; Umia takes no fee on a launch.",
    Revenue: "What accrues to the protocol fee recipient: the protocol cut of spot and winning-proposal decision-market fees, plus the recipient's share of the LP half through vault shares it holds.",
    ProtocolRevenue: "Identical to Revenue. All of it accrues to the protocol fee recipient.",
    SupplySideRevenue: "The LP half of spot and winning-proposal decision-market fees accruing to each venture's SpotLiquidityVault, less the fee recipient's share.",
    HoldersRevenue: "None. No buyback, burn or staker distribution exists on-chain.",
    Volume: "Money-token leg of every swap on a venture's Uniswap v4 spot pool. Pool ids come from each venture vault's own pool key. Decision-market trades are conditional and are not counted as volume.",
  },
  breakdownMethodology: {
    Fees: FEE_LABELS,
    UserFees: FEE_LABELS,
    Revenue: REVENUE_LABELS,
    ProtocolRevenue: REVENUE_LABELS,
    SupplySideRevenue: {
      [LABEL.SPOT_LP]: "The LP half of spot swap fees accruing to the venture's SpotLiquidityVault, less the fee recipient's share.",
      [LABEL.DM_LP]: "The LP half of the winning proposal's decision-market fees accruing to the venture's vault, less the fee recipient's share.",
    },
  },
  // Spot pools are Uniswap v4 pools, so fees and volume also count under Uniswap.
  doublecounted: true,
};

export default adapter;

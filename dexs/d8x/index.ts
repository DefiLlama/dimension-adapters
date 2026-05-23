import { Chain } from "../../adapters/types";
import {
  Adapter,
  FetchOptions,
  FetchResultV2,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

type TManagers = {
  [key in Chain]?: string;
};

const managerContracts: TManagers = {
  [CHAIN.ARBITRUM]: "0x8f8BccE4c180B699F81499005281fA89440D1e95",
  [CHAIN.BASE]: "0x7F3A4A9e5BB469F0F4977AA390760aF9EFCCd406",
  [CHAIN.BERACHAIN]: "0xb6329c7168b255Eca8e5c627b0CCe7A5289C8b7F",
  [CHAIN.POLYGON_ZKEVM]: "0xaB7794EcD2c8e9Decc6B577864b40eBf9204720f",
};

const ABDKToFloat = (x: bigint): number => {
  // ABDK: value(x) = x / 2 ** 64
  return Number(x) / 2 ** 64;
};

const LIQUIDATE_EVENT = "event Liquidate(uint24 perpetualId,address indexed liquidator,address indexed trader,int128 amountLiquidatedBC,int128 liquidationPrice,int128 newPositionSizeBC,int128 fFeeCC,int128 fPnlCC)";
const TRADE_EVENT = "event Trade(uint24 indexed perpetualId,address indexed trader,tuple(uint16 leverageTDR,uint16 brokerFeeTbps,uint24 iPerpetualId,address traderAddr,uint32 executionTimestamp,address brokerAddr,uint32 submittedTimestamp,uint32 flags,uint32 iDeadline,address executorAddr,int128 fAmount,int128 fLimitPrice,int128 fTriggerPrice,bytes brokerSignature) order,bytes32 orderDigest,int128 newPositionSizeBC,int128 price,int128 fFeeCC,int128 fPnlCC,int128 fB2C)";
const DISTRIBUTE_FEES_EVENT = "event DistributeFees(uint8 indexed poolId,uint24 indexed perpetualId,address indexed trader,int128 protocolFeeCC,int128 participationFundFeeCC)";
const GET_POOL_ID = "function getPoolIdByPerpetualId(uint24 _perpetualId) view returns (uint8)";
const GET_LIQUIDITY_POOL = "function getLiquidityPool(uint8 _poolId) view returns ((bool isRunning,uint8 iPerpetualCount,uint8 id,int32 fCeilPnLShare,uint8 marginTokenDecimals,uint16 iTargetPoolSizeUpdateTime,address marginTokenAddress,uint64 prevAnchor,int128 fRedemptionRate,address shareTokenAddress,int128 fPnLparticipantsCashCC,int128 fTargetAMMFundSize,int128 fDefaultFundCashCC,int128 fTargetDFSize,int128 fBrokerCollateralLotSize,uint128 prevTokenAmount,uint128 nextTokenAmount,uint128 totalSupplyShareToken,int128 fBrokerFundCashCC))";
const SUPPLY_SIDE_FEES = "Fees To LPs, Liquidators and Partners";

const fetch = async ({ createBalances, getLogs, chain, api }: FetchOptions): Promise<FetchResultV2> => {
  const managerAddr = managerContracts[chain];
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const [liquidations, trades, feeDistributions] = await Promise.all([
    getLogs({ target: managerAddr, eventAbi: LIQUIDATE_EVENT }),
    getLogs({ target: managerAddr, eventAbi: TRADE_EVENT }),
    getLogs({ target: managerAddr, eventAbi: DISTRIBUTE_FEES_EVENT }),
  ]);

  const liquidationsVolume = liquidations
    .map(
      (e) =>
        Math.abs(ABDKToFloat(e.amountLiquidatedBC)) *
        ABDKToFloat(e.liquidationPrice)
    )
    .reduce((a: number, b: number) => a + b, 0);

  const tradesVolume = trades
    .map((e) => Math.abs(ABDKToFloat(e.order.fAmount)) * ABDKToFloat(e.price))
    .reduce((a: number, b: number) => a + b, 0);

  const uniquePerpetualIds = Array.from(
    new Set([...trades, ...liquidations].map((e) => Number(e.perpetualId)))
  );
  const poolIdsByPerpetual = uniquePerpetualIds.length
    ? await api.multiCall({
      target: managerAddr,
      abi: GET_POOL_ID,
      calls: uniquePerpetualIds,
    })
    : [];

  const poolByPerpetualId: Record<number, number> = {};
  uniquePerpetualIds.forEach((perpetualId, index) => {
    poolByPerpetualId[perpetualId] = Number(poolIdsByPerpetual[index]);
  });

  const poolIds = Array.from(
    new Set([
      ...Object.values(poolByPerpetualId),
      ...feeDistributions.map((e) => Number(e.poolId)),
    ])
  );
  const poolInfo = poolIds.length
    ? await api.multiCall({
      target: managerAddr,
      abi: GET_LIQUIDITY_POOL,
      calls: poolIds,
    })
    : [];

  const poolById: Record<number, { token: string; decimals: number }> = {};
  poolIds.forEach((poolId, index) => {
    const token = poolInfo[index]?.marginTokenAddress;
    const decimals = Number(poolInfo[index]?.marginTokenDecimals);
    if (!token || !Number.isFinite(decimals)) {
      console.warn(`[d8x] Missing pool metadata for poolId=${poolId} on ${chain}`);
      return;
    }
    poolById[poolId] = {
      token,
      decimals,
    };
  });

  const addPoolAmount = (balances: any, poolId: number, amount: number, label: string) => {
    if (!amount) return;
    const pool = poolById[poolId];
    if (!pool) {
      balances.addUSDValue(amount, label);
      return;
    }
    balances.add(pool.token, amount * 10 ** pool.decimals, label);
  };

  const feesByPoolId: Record<number, number> = {};
  const protocolRevenueByPoolId: Record<number, number> = {};

  for (const trade of trades) {
    const poolId = poolByPerpetualId[Number(trade.perpetualId)];
    const fee = Math.abs(ABDKToFloat(trade.fFeeCC));
    feesByPoolId[poolId] = (feesByPoolId[poolId] ?? 0) + fee;
    addPoolAmount(dailyFees, poolId, fee, METRIC.TRADING_FEES);
  }

  for (const liquidation of liquidations) {
    const poolId = poolByPerpetualId[Number(liquidation.perpetualId)];
    const fee = Math.abs(ABDKToFloat(liquidation.fFeeCC));
    feesByPoolId[poolId] = (feesByPoolId[poolId] ?? 0) + fee;
    addPoolAmount(dailyFees, poolId, fee, METRIC.LIQUIDATION_FEES);
  }

  for (const distribution of feeDistributions) {
    const poolId = Number(distribution.poolId);
    const protocolFee = Math.abs(ABDKToFloat(distribution.protocolFeeCC));
    protocolRevenueByPoolId[poolId] = (protocolRevenueByPoolId[poolId] ?? 0) + protocolFee;
    addPoolAmount(dailyRevenue, poolId, protocolFee, METRIC.PROTOCOL_FEES);
    addPoolAmount(dailyProtocolRevenue, poolId, protocolFee, METRIC.PROTOCOL_FEES);
  }

  Object.entries(feesByPoolId).forEach(([poolId, fees]) => {
    const supplySideFees = fees - (protocolRevenueByPoolId[Number(poolId)] ?? 0);
    addPoolAmount(dailySupplySideRevenue, Number(poolId), Math.max(supplySideFees, 0), SUPPLY_SIDE_FEES);
  });

  return {
    dailyVolume: liquidationsVolume + tradesVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Notional volume from Trade and Liquidate events (|amount| × price).",
  Fees: "fFeeCC from Trade and Liquidate events in the pool's collateral token.",
  UserFees: "All trading and liquidation fees paid by traders.",
  Revenue: "protocolFeeCC from DistributeFees events.",
  ProtocolRevenue: "protocolFeeCC from DistributeFees events.",
  SupplySideRevenue: "Total fees minus protocol fees (LPs, liquidators, partners).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Trading fees from Trade events.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation fees from Liquidate events.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Trading fees from Trade events.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation fees from Liquidate events.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fees from DistributeFees events.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol fees from DistributeFees events.",
  },
  SupplySideRevenue: {
    [SUPPLY_SIDE_FEES]: "Total fees minus protocol fees.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch, start: "2023-03-26",
    },
    [CHAIN.BASE]: {
      fetch, start: "2024-12-03",
    },
    [CHAIN.BERACHAIN]: {
      fetch, start: "2025-02-10",
    },
    [CHAIN.POLYGON_ZKEVM]: {
      fetch, start: "2023-10-12",
    },
  },
};

export default adapter;

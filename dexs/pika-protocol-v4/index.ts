import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const PIKA_PERP = "0x8c9b6a4a4e61f4635e8e375e05ff98db5516d25e";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const [newPositionLogs, closePositionLogs] = await Promise.all([
    options.getLogs({
      target: PIKA_PERP,
      eventAbi: "event NewPosition(uint256 indexed positionId, address indexed user, uint256 indexed productId, bool isLong, uint256 price, uint256 oraclePrice, uint256 margin, uint256 leverage, uint256 fee, int256 funding)",
    }),
    options.getLogs({
      target: PIKA_PERP,
      eventAbi: "event ClosePosition(uint256 indexed positionId, address indexed user, uint256 indexed productId, uint256 price, uint256 entryPrice, uint256 margin, uint256 leverage, uint256 fee, int256 pnl, int256 fundingPayment, bool wasLiquidated)",
    }),
  ]);

  for (const log of newPositionLogs) {
    // volume = margin * leverage / 1e8 (both in 8-decimal internal representation)
    dailyVolume.addUSDValue(Number(log.margin) * Number(log.leverage) / 1e16);
    dailyFees.addUSDValue(Number(log.fee) / 1e8);
  }

  for (const log of closePositionLogs) {
    dailyVolume.addUSDValue(Number(log.margin) * Number(log.leverage) / 1e16);
    dailyFees.addUSDValue(Number(log.fee) / 1e8);
  }

  // Fee split: _updatePendingRewards splits reward * ratio / 1e4 per bucket.
  // Contract source: https://sourcify.dev/server/repository/contracts/full_match/10/0x8c9b6a4a4e61f4635e8e375e05ff98db5516d25e/sources/contracts/perp/PikaPerpV4.sol
  // Current on-chain values: protocolRewardRatio=5000, pikaRewardRatio=0 (PIKA staking disabled).
  // → 50% to vault (LPs), 50% to protocol treasury, 0% to PIKA stakers.
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(0.5),
    dailySupplySideRevenue: dailyFees.clone(0.5),
    dailyProtocolRevenue: dailyFees.clone(0.5),
  };
};

const methodology = {
  Volume: "Notional volume of positions opened and closed (margin * leverage).",
  Fees: "Trading fees paid by traders on opening and closing positions.",
  Revenue: "50% of trading fees retained by the protocol (protocolRewardRatio=5000/10000).",
  SupplySideRevenue: "50% of trading fees distributed to the vault (liquidity providers).",
  ProtocolRevenue: "50% of trading fees sent to the protocol treasury.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2023-06-28",
    },
  },
  methodology,
};

export default adapter;

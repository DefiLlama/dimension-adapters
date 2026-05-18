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

  // Fee split sources:
  //   - 50% vault (LPs) / 50% protocol: https://docs.pikaprotocol.com/features
  //   - 30% of total fees to PIKA stakers: https://docs.pikaprotocol.com/reward-program
  //   → remaining 20% goes to protocol treasury (50% protocol share − 30% stakers)
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees.clone(0.5),
    dailySupplySideRevenue: dailyFees.clone(0.5),
    dailyHoldersRevenue: dailyFees.clone(0.3),
    dailyProtocolRevenue: dailyFees.clone(0.2),
  };
};

const methodology = {
  Volume: "Notional volume of positions opened and closed (margin * leverage).",
  Fees: "Trading fees paid by traders on opening and closing positions.",
  Revenue: "Fees retained by the protocol after the LP/vault share (50% of fees).",
  SupplySideRevenue: "50% of trading fees distributed to the vault (liquidity providers).",
  HoldersRevenue: "30% of trading fees distributed to PIKA token stakers.",
  ProtocolRevenue: "20% of trading fees sent to the protocol treasury.",
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

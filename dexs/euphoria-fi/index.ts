import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

// Euphoria seems to have 0 fees starting from 2026-05-08 (Fees Docs updated around same timeline)
// Data verified against https://dune.com/dune/euphoria-analytics-ddf0
const CONTRACT = "0x12759afcA690637b425ffbA3265F0Dc2F6242A8D";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ABIS = {
  tradeExecuted: "event TradeExecuted(bytes20 indexed orderId, address indexed user, address indexed vault)",
  positionSettled: "event PositionSettled(bytes20 indexed positionId, address indexed recipient, uint256 payout, uint256 fee)",
  transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
};

const topicAddress = (address: string) =>
  `0x000000000000000000000000${address.toLowerCase().replace("0x", "")}`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyNotionalVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const [tradeLogs, settlementLogs, transferLogs] = await Promise.all([
    options.getLogs({
      target: CONTRACT,
      eventAbi: ABIS.tradeExecuted,
      onlyArgs: false,
    }),
    options.getLogs({
      target: CONTRACT,
      eventAbi: ABIS.positionSettled,
    }),
    options.getLogs({
      target: ADDRESSES.megaeth.USDm,
      eventAbi: ABIS.transfer,
      topics: [TRANSFER_TOPIC, null as any, topicAddress(CONTRACT)],
      onlyArgs: false,
    }),
  ]);

  const tradeUsersByTx = new Set(
    tradeLogs.map((log: any) => `${log.transactionHash?.toLowerCase()}:${log.args.user?.toLowerCase()}`)
  );

  transferLogs.forEach((log: any) => {
    const from = log.args.from?.toLowerCase();
    const txHash = log.transactionHash?.toLowerCase();
    if (tradeUsersByTx.has(`${txHash}:${from}`)) {
      dailyVolume.add(ADDRESSES.megaeth.USDm, log.args.value);
    }
  });

  // https://dune.com/queries/6973151/10888904 (Notional Volume)
  settlementLogs.forEach((log: any) => {
    dailyNotionalVolume.add(ADDRESSES.megaeth.USDm, log.payout);
    dailyFees.add(ADDRESSES.megaeth.USDm, log.fee, METRIC.TRADING_FEES);
    dailyRevenue.add(ADDRESSES.megaeth.USDm, log.fee, "Trading Fees To Protocol");
  });

  return {
    dailyVolume,
    dailyNotionalVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MEGAETH],
  start: "2026-05-01",
  methodology: {
    Fees: "Includes all trading fees paid by Euphoria users.",
    Revenue: "Revenue is trading fees retained by Euphoria.",
    ProtocolRevenue: "Protocol revenue is trading fees retained by Euphoria.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Trading fees paid by Euphoria users.",
    },
    Revenue: {
      "Trading Fees To Protocol": "Trading fees retained by protocol.",
    },
    ProtocolRevenue: {
      "Trading Fees To Protocol": "Trading fees retained by protocol.",
    },
  },
};

export default adapter;
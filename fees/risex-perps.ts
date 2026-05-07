import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// TODO: Revisit fee attribution after RiseX open mainnet/builder launch.

const FEE_MANAGER = "0x11541dc387b9c307043ea732127df92b80bab52b";

// Source: CollectedFees(protocol, token, amount) on RiseX FeeManager, Perps Manager.
const PROTOCOL = "0x53f10facfc8965750494e6965f5d6da39b41d852";
// Source: Rise Trade markets API currently lists this quote token as USDC for all markets.
const USDC = "0xe436820ba0c69702c1d3e601d421c0ef38262739";

const COLLECTED_FEES_EVENT = "event CollectedFees(address indexed protocol, address indexed token, uint256 amount)";
// Source: PerpsManager OnTakeLevel exposes liquidationFee separately from takerFee.
const ON_TAKE_LEVEL_EVENT = "event OnTakeLevel(uint16 indexed marketId, uint56 indexed takerOrderId, uint24 tickLevel, uint128 matchedSize, int256 takerFee, int256 liquidationFee, int128 accumulatedFundingPayment)";
const WAD = 1e18;
const BLOCK_CHUNK_SIZE = 300;

const getChunkedLogs = async (options: FetchOptions, target: string, eventAbi: string, fromBlock: number, toBlock: number) => {
  const logs: any[] = [];

  // Rise RPC caps eth_getLogs responses at 5k results, so split each adapter window into smaller block ranges.
  for (let start = fromBlock; start <= toBlock; start += BLOCK_CHUNK_SIZE) {
    logs.push(...await options.getLogs({
      target,
      eventAbi,
      fromBlock: start,
      toBlock: Math.min(start + BLOCK_CHUNK_SIZE - 1, toBlock),
    }));
  }

  return logs;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const [tradingFeeLogs, liquidationFeeLogs] = await Promise.all([
    getChunkedLogs(options, FEE_MANAGER, COLLECTED_FEES_EVENT, fromBlock, toBlock),
    getChunkedLogs(options, PROTOCOL, ON_TAKE_LEVEL_EVENT, fromBlock, toBlock),
  ]);

  // FeeManager stores Currency amounts in 18-decimal internal accounting units.
  const fees = tradingFeeLogs
    .filter((log: any) => log.protocol.toLowerCase() === PROTOCOL && log.token.toLowerCase() === USDC)
    .reduce((total: number, log: any) => total + Number(log.amount) / WAD, 0);
  const liquidationFees = liquidationFeeLogs
    .filter((log: any) => Number(log.liquidationFee) > 0)
    .reduce((total: number, log: any) => total + Number(log.liquidationFee) / WAD, 0);
  if (!Number.isFinite(fees) || !Number.isFinite(liquidationFees) || fees < 0 || liquidationFees < 0) {
    throw new Error("RiseX fees value invalid");
  }

  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailyUserFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(fees, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.addUSDValue(fees, METRIC.PROTOCOL_FEES);
  dailyFees.addUSDValue(liquidationFees, METRIC.LIQUIDATION_FEES);
  dailyUserFees.addUSDValue(liquidationFees, METRIC.LIQUIDATION_FEES);
  dailySupplySideRevenue.addUSDValue(liquidationFees, METRIC.LIQUIDATION_FEES);

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Perpetual trading fees and liquidation fees paid by users.",
  UserFees: "Perpetual trading fees and liquidation fees paid by users.",
  Revenue: "Trading fees collected by the protocol.",
  ProtocolRevenue: "Trading fees collected by the protocol.",
  SupplySideRevenue: "Liquidation fees are paid to liquidators.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Perpetual trading fees paid by users.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation fees charged when positions are liquidated.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Perpetual trading fees paid by users.",
    [METRIC.LIQUIDATION_FEES]: "Liquidation fees charged when positions are liquidated.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees collected by the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees collected by the protocol.",
  },
  SupplySideRevenue: {
    [METRIC.LIQUIDATION_FEES]: "Liquidation fees are paid to liquidators.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.RISE],
  start: "2026-04-01",
  methodology,
  breakdownMethodology,
};

export default adapter;

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
const WAD_DECIMALS = 18;
const BLOCK_CHUNK_SIZE = 300;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const logs = [];
  // Rise RPC caps eth_getLogs responses at 5k results, so split each adapter window into smaller block ranges.
  for (let start = fromBlock; start <= toBlock; start += BLOCK_CHUNK_SIZE) {
    const end = Math.min(start + BLOCK_CHUNK_SIZE - 1, toBlock);
    logs.push(...await options.getLogs({
      target: FEE_MANAGER,
      eventAbi: COLLECTED_FEES_EVENT,
      fromBlock: start,
      toBlock: end,
    }));
  }

  // FeeManager stores Currency amounts in 18-decimal internal accounting units.
  const fees = logs
    .filter((log: any) => log.protocol.toLowerCase() === PROTOCOL && log.token.toLowerCase() === USDC)
    .reduce((total: number, log: any) => total + Number(log.amount) / 10 ** WAD_DECIMALS, 0);
  if (!Number.isFinite(fees) || fees < 0) {
    throw new Error("RiseX fees value invalid");
  }

  dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailyUserFees.addUSDValue(fees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(fees, METRIC.PROTOCOL_FEES);
  dailyProtocolRevenue.addUSDValue(fees, METRIC.PROTOCOL_FEES);

  return { dailyFees, dailyUserFees, dailyRevenue, dailyProtocolRevenue };
};

const methodology = {
  Fees: "Perpetual trading fees paid by users.",
  UserFees: "Perpetual trading fees paid by users.",
  Revenue: "Trading fees collected by the protocol.",
  ProtocolRevenue: "Trading fees collected by the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Perpetual trading fees paid by users.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Perpetual trading fees paid by users.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees collected by the protocol.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Trading fees collected by the protocol.",
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

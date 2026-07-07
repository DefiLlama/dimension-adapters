import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const FEE_RECIPIENT = "0x858f0F5eE954846D47155F5203c04aF1819eCeF8";
const START = "2026-06-08";
const SAFE_RECEIVED_EVENT = "event SafeReceived (address indexed sender, uint256 value)"

const fetch = async (options: FetchOptions) => {
  const SafeReceivedLogs = await options.getLogs({
    target: FEE_RECIPIENT,
    eventAbi: SAFE_RECEIVED_EVENT,
  })

  const dailyFees = options.createBalances()

  for (const log of SafeReceivedLogs) {
    dailyFees.addGasToken(log.value, 'Partner Fees')
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "Flat partner fee taken on every Ophis swap (10 bps standard, 1 bp on stablecoin pairs), measured as gas tokens received by protocol safe wallet.",
  Revenue: "All flat partner fees taken on every Ophis swap (10 bps standard, 1 bp on stablecoin pairs), measured as gas tokens received by protocol safe wallet is retained by Ophis.",
  ProtocolRevenue: "All flat partner fees taken on every Ophis swap (10 bps standard, 1 bp on stablecoin pairs), measured as gas tokens received by protocol safe wallet is retained by Ophis.",
};

const breakdownMethodology = {
  Fees: {
    'Partner Fees': 'Flat partner fee taken on every Ophis swap (10 bps standard, 1 bp on stablecoin pairs), measured as gas tokens received by protocol safe wallet.',
  },
  Revenue: {
    'Partner Fees': 'All flat partner fees taken on every Ophis swap (10 bps standard, 1 bp on stablecoin pairs), measured as gas tokens received by protocol safe wallet is retained by Ophis.',
  },
  ProtocolRevenue: {
    'Partner Fees': 'All flat partner fees taken on every Ophis swap (10 bps standard, 1 bp on stablecoin pairs), measured as gas tokens received by protocol safe wallet is retained by Ophis.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  start: START,
  chains: [CHAIN.ETHEREUM, CHAIN.OPTIMISM, CHAIN.BSC, CHAIN.XDAI, CHAIN.POLYGON, CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.AVAX, CHAIN.LINEA, CHAIN.INK, CHAIN.PLASMA],
};

export default adapter;

import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FEE_MULTISIG = "0x41E046D798B0f0D705Dd4BAf1FC9Aa5fdf8822f1";
const SAFE_RECEIVED_ABI = "event SafeReceived(address indexed sender, uint256 value)";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const safeReceivedLogs = await options.getLogs({
    target: FEE_MULTISIG,
    eventAbi: SAFE_RECEIVED_ABI,
  });

  safeReceivedLogs.forEach(log => {
    dailyFees.addGasToken(log.value, 'Platform Fees');
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "1% platform fee from every buy/sell transaction in BondingCurve contracts",
  Revenue: "1% platform fee from every buy/sell transaction in BondingCurve contracts",
  ProtocolRevenue: "1% platform fee from every buy/sell transaction in BondingCurve contracts",
}

const breakdownMethodology = {
  Fees: {
    'Platform Fees': "1% platform fee from every buy/sell transaction in BondingCurve contracts",
  },
  Revenue: {
    'Platform Fees': "1% platform fee from every buy/sell transaction in BondingCurve contracts",
  },
  ProtocolRevenue: {
    'Platform Fees': "1% platform fee from every buy/sell transaction in BondingCurve contracts",
  },
}

const adapter: any = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  pullHourly: true,
  start: "2026-05-12",
  breakdownMethodology,
  methodology,
};

export default adapter;

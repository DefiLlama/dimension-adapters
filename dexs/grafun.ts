import { FetchOptions, Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const chainConfig: Record<string, { contract: string; eventAbi: string; start: string; amountKey: string }> = {
  [CHAIN.BSC]: {
    contract: "0x8341b19a2A602eAE0f22633b6da12E1B016E6451",
    eventAbi: "event Swap(address indexed token,address indexed referrer,address indexed account,bool isBuy,uint256 bnbAmount,uint256 tokenAmount,uint256 fee,uint256 reserved)",
    start: "2024-09-26",
    amountKey: "bnbAmount",
  },
  [CHAIN.ETHEREUM]: {
    contract: "0xb8540a7d74Cc4912443e8c4B2064B640FC763c4f",
    eventAbi: "event Swap(address indexed token,address indexed referrer,address indexed account,bool isBuy,uint256 ethAmount,uint256 tokenAmount,uint256 fee,uint256 reserved)",
    start: "2024-11-27",
    amountKey: "ethAmount",
  }
}

async function fetch(options: FetchOptions) {
  const config = chainConfig[options.chain];
  const tradeLogs = await options.getLogs({
    target: config.contract,
    eventAbi: config.eventAbi,
  })

  const dailyFees = options.createBalances();
  const dailyVolume = options.createBalances();

  for (const log of tradeLogs) {
    dailyVolume.addGasToken(log[config.amountKey]);
    dailyFees.addGasToken(log.fee, METRIC.SWAP_FEES);
  }

  return {
    dailyFees,
    dailyVolume,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Sum of all fees from Token Sale Factory smart contract.",
  Revenue: "All the fees from Token Sale Factory smart contract are revenue.",
  ProtocolRevenue: "All the fees from Token Sale Factory smart contract are protocol revenue.",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees collected in native gas token from the Token Sale Factory smart contract swap events.",
  },
  Revenue: {
    [METRIC.SWAP_FEES]: "Revenue collected in native gas token from the Token Sale Factory smart contract swap events.",
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: "Revenue collected in native gas token from the Token Sale Factory smart contract swap events.",
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
}

export default adapter;
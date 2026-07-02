import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const CIRCLE_GATEWAY_CONTRACT = "0x77777777Dcc4d5A8B6E418Fd04D8997ef11000eE";
const GATEWAY_BURNED_EVENT = "event GatewayBurned(address indexed token, address indexed depositor, bytes32 indexed transferSpecHash, uint32 destinationDomain, bytes32 destinationRecipient, address signer, uint256 value, uint256 fee, uint256 fromAvailable, uint256 fromWithdrawing)";
const USDC_DECIMALS = 6;

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const gatewayBurnedLogs = await options.getLogs({
    target: CIRCLE_GATEWAY_CONTRACT,
    eventAbi: GATEWAY_BURNED_EVENT,
  })

  for (const log of gatewayBurnedLogs) {
    dailyFees.addUSDValue(Number(log.fee) / 10 ** USDC_DECIMALS, "Gateway Fees");
  }

  return {
    dailyFees,
  };
}

const methodology = {
  Fees: "Includes tranfer fees, gas fees and transaction fees, exact breakdown isnt available onchain",
}

const breakdownMethodology = {
  Fees: {
    "Gateway Fees": "Fees collected for the transfer of funds through the Circle Gateway",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.BASE]: { start: "2025-07-17" },
    [CHAIN.AVAX]: { start: "2025-07-17" },
    [CHAIN.ARBITRUM]: { start: "2025-07-17" },
    [CHAIN.UNICHAIN]: { start: "2025-07-17" },
    [CHAIN.OPTIMISM]: { start: "2025-07-17" },
    [CHAIN.POLYGON]: { start: "2025-07-18" },
    [CHAIN.ETHEREUM]: { start: "2025-07-21" },
  },
  methodology,
  breakdownMethodology,
  skipBreakdownValidation: true, //skipping because exact breakdown isnt available onchain
}

export default adapter;
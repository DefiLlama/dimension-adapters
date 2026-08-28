import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const chainConfig: Record<string, { gasReceipient: string, start: string }> = {
  [CHAIN.BASE]: {
    gasReceipient: "0x948aD4bD2B858398F94186680EB09A936FAAcc70",
    start: "2025-05-21",
  },
  [CHAIN.APECHAIN]: {
    gasReceipient: "0x12C02A0Da0CF164539CcA806784f47D6cB2ddaF0",
    start: "2025-05-21",
  },
  [CHAIN.ARBITRUM]: {
    gasReceipient: "0x948aD4bD2B858398F94186680EB09A936FAAcc70",
    start: "2025-05-21",
  },
  [CHAIN.ETHEREUM]: {
    gasReceipient: "0xEb90D6FE5421F1a3B8F2cdC562B30960db6190ED",
    start: "2025-06-24",
  },
  [CHAIN.BSC]: {
    gasReceipient: "0x902f7228048e6864584958f3720DD59c08B8A361",
    start: "2025-07-07",
  }
}

const GAS_PAYMENT_EVENT = "event GasPayment (bytes32 indexed messageId, uint32 indexed destinationDomain, uint256 gasAmount, uint256 payment)"

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();

  const { gasReceipient } = chainConfig[options.chain];

  const gasPaidLogs = await options.getLogs({
    target: gasReceipient,
    eventAbi: GAS_PAYMENT_EVENT,
  })

  for (const log of gasPaidLogs) {
    dailyFees.addGasToken(log.payment, "Messaging Fees");
  }

  return {
    dailyFees,
  }
}

const methodology = {
  Fees: "Messaging Fees paid by users to cover gas costs for cross-chain messaging, revenue is not calculated as exact costs can't be derived from the logs."
}

const breakdownMethodology = {
  Fees: {
    "Messaging Fees": "Messaging Fees paid by users to cover gas costs for cross-chain messaging."
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig,
  skipBreakdownValidation: true,
}

export default adapter;
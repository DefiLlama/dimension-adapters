import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const REPORT_RESULT_EVENT = "event ReportResult(address indexed attestor, bytes32 taskId, address user, uint8 tokenSymbol, uint256 primusFee, uint256 attestorFee)";

const chainConfig: Record<string, { task: string; start: string }> = {
  // https://docs.primuslabs.xyz/primus-network/attestor-node-guides/
  [CHAIN.BASE]: {
    task: "0x151cb5eD5D10A42B607bB172B27BDF6F884b9707",
    start: "2025-10-16",
  },
  [CHAIN.HASHKEY]: {
    task: "0x1c5D0d5e0a3e0a5c9B0cDcF5C25A892281e4cd04",
    start: "2026-03-31",
  },
};

const labels = {
  fees: METRIC.SERVICE_FEES,
  primus: "Service Fees To Primus",
  attestors: "Service Fees To Attestors",
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    target: chainConfig[options.chain].task,
    eventAbi: REPORT_RESULT_EVENT,
  });

  for (const log of logs) {
    const primusFee = BigInt(log.primusFee);
    const attestorFee = BigInt(log.attestorFee);
    const totalFee = primusFee + attestorFee;

    dailyFees.addGasToken(totalFee, labels.fees);
    dailyUserFees.addGasToken(totalFee, labels.fees);
    dailyRevenue.addGasToken(primusFee, labels.primus);
    dailyProtocolRevenue.addGasToken(primusFee, labels.primus);
    dailySupplySideRevenue.addGasToken(attestorFee, labels.attestors);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Native-token fees paid by users for completed Primus verification reports.",
  UserFees: "Native-token fees paid by users for completed Primus verification reports.",
  Revenue: "The portion of verification fees paid to Primus.",
  ProtocolRevenue: "The portion of verification fees paid to Primus.",
  SupplySideRevenue: "The portion of verification fees paid to attestor node operators.",
};

const breakdownMethodology = {
  Fees: {
    [labels.fees]: "Total fees settled when attestors successfully submit verification reports.",
  },
  UserFees: {
    [labels.fees]: "Total fees paid by users for successfully completed verification reports.",
  },
  Revenue: {
    [labels.primus]: "Verification fees allocated to Primus when reports are completed.",
  },
  ProtocolRevenue: {
    [labels.primus]: "Verification fees allocated to Primus when reports are completed.",
  },
  SupplySideRevenue: {
    [labels.attestors]: "Verification fees paid to attestor node operators when reports are completed.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology,
  breakdownMethodology,
};

export default adapter;

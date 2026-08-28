import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CherumContracts, BatchLegEvent, FeeCollectedEvent, IntegratorFeeCollectedEvent } from "../../helpers/aggregators/cherum";

const ProtocolFee = "Cherum protocol fee";
const ProtocolFeeToProtocol = "Cherum Protocol Fee To Protocol";
const IntegratorFee = "Integrator fee";
const IntegratorFeeToIntegrators = "Integrator Fee To Integrators";

// Same-chain fan-out batch swaps routed by CherumRouter. Volume is the input
// notional per successful leg; failed legs are refunded in the same tx and
// are not counted. Cross-chain legs are reported by the Cherum
// bridge-aggregators adapter instead.
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const router = CherumContracts[options.chain].router;

  const batchLegLogs: any[] = await options.getLogs({
    target: router,
    eventAbi: BatchLegEvent,
  });

  const feeCollectedLogs: any[] = await options.getLogs({
    target: router,
    eventAbi: FeeCollectedEvent,
  })

  const integratorFeeCollectedLogs: any[] = await options.getLogs({
    target: router,
    eventAbi: IntegratorFeeCollectedEvent,
  })

  batchLegLogs.forEach((log: any) => {
    if (!log.success) return;
    dailyVolume.add(log.fromToken, log.amountIn);
  });

  feeCollectedLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount, ProtocolFee);
    dailyRevenue.add(log.token, log.amount, ProtocolFeeToProtocol);
  })

  integratorFeeCollectedLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount, IntegratorFee);
    dailySupplySideRevenue.add(log.token, log.amount, IntegratorFeeToIntegrators);
  })

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const methodology = {
  Volume: "Input notional of successful same-chain batch-swap legs routed through CherumRouter (BatchLeg events, after fees).",
  Fees: "Routing fees paid by users on each same-chain batch swap, charged in the input token.",
  Revenue: "The portion of routing fees retained by the Cherum protocol.",
  ProtocolRevenue: "The portion of routing fees retained by the Cherum protocol.",
  SupplySideRevenue: "Integrator markups paid out to third-party partners that embed Cherum.",
}

const breakdownMethodology = {
  Fees: {
    [ProtocolFee]: "Fee retained by the Cherum protocol (FeeCollected events).",
    [IntegratorFee]: "Markup paid to third-party integrators (IntegratorFeeCollected events).",
  },
  Revenue: {
    [ProtocolFeeToProtocol]: "Fee retained by the Cherum protocol.",
  },
  SupplySideRevenue: {
    [IntegratorFeeToIntegrators]: "Markup paid to third-party integrators (IntegratorFeeCollected events).",
  },
  ProtocolRevenue: {
    [ProtocolFeeToProtocol]: "Fee retained by the Cherum protocol.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: CherumContracts,
  methodology,
  breakdownMethodology,
};

export default adapter;

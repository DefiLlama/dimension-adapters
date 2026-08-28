import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CherumContracts, BatchOpenedEvent, FeeCollectedEvent, IntegratorFeeCollectedEvent } from "../../helpers/aggregators/cherum";

const ProtocolFee = "Cherum protocol fee";
const ProtocolFeeToProtocol = "Cherum Protocol Fee To Protocol";
const IntegratorFee = "Integrator fee";
const IntegratorFeeToIntegrators = "Integrator Fee To Integrators";

// Cross-chain fan-out batches opened on the source chain by
// CherumFanOutRouter. Bridge volume is the principal actually dispatched
// into bridges (input token, after fees), counted once on the source chain;
// destination-side delivery is not counted again.
const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const fanout = CherumContracts[options.chain].fanout;

  const batchOpenedLogs: any[] = await options.getLogs({
    target: CherumContracts[options.chain].fanout,
    eventAbi: BatchOpenedEvent,
  });

  const feeCollectedLogs: any[] = await options.getLogs({
    target: fanout,
    eventAbi: FeeCollectedEvent,
  })

  const integratorFeeCollectedLogs: any[] = await options.getLogs({
    target: fanout,
    eventAbi: IntegratorFeeCollectedEvent,
  })

  batchOpenedLogs.forEach((log: any) => {
    dailyBridgeVolume.add(log.tokenIn, log.principal);
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
    dailyBridgeVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  BridgeVolume: "Principal dispatched into bridges by cross-chain fan-out batches on the source chain (BatchOpened events, input token, after fees).",
  Fees: "Routing fees paid by users on each cross-chain batch swap, charged in the input token.",
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

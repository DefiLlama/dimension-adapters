import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import {
  CherumContracts,
  FeeCollectedEvent,
  IntegratorFeeCollectedEvent,
} from "../../helpers/aggregators/cherum";

const ProtocolFee = "Cherum protocol fee";
const ProtocolFeeToProtocol = "Cherum Protocol Fee To Protocol";
const IntegratorFee = "Integrator fee";
const IntegratorFeeToIntegrators = "Integrator Fee To Integrators";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { router, fanout } = CherumContracts[options.chain];

  // Both routers charge fees in the input token and emit the same events.
  const protocolLogs: any[] = await options.getLogs({
    targets: [router, fanout],
    eventAbi: FeeCollectedEvent,
    flatten: true,
  });
  protocolLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount, ProtocolFee);
    dailyRevenue.add(log.token, log.amount, ProtocolFeeToProtocol);
  });

  const integratorLogs: any[] = await options.getLogs({
    targets: [router, fanout],
    eventAbi: IntegratorFeeCollectedEvent,
    flatten: true,
  });
  integratorLogs.forEach((log: any) => {
    dailyFees.add(log.token, log.amount, IntegratorFee);
    dailySupplySideRevenue.add(log.token, log.amount, IntegratorFeeToIntegrators);
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.keys(CherumContracts).reduce(
    (acc, chain) => ({
      ...acc,
      [chain]: { fetch, start: CherumContracts[chain].start },
    }),
    {},
  ),
  methodology: {
    Fees: "Routing fees paid by users on each cross-chain fan-out and same-chain batch swap, charged in the input token.",
    Revenue: "The portion of routing fees retained by the Cherum protocol.",
    ProtocolRevenue: "The portion of routing fees retained by the Cherum protocol.",
    SupplySideRevenue: "Integrator markups paid out to third-party partners that embed Cherum.",
  },
  breakdownMethodology: {
    Fees: {
      [ProtocolFee]: "Fee retained by the Cherum protocol (FeeCollected events).",
      [IntegratorFee]: "Markup paid to third-party integrators (IntegratorFeeCollected events).",
    },
    Revenue: {
      [ProtocolFeeToProtocol]: "Fee retained by the Cherum protocol.",
    },
    ProtocolRevenue: {
      [ProtocolFeeToProtocol]: "Fee retained by the Cherum protocol.",
    },
    SupplySideRevenue: {
      [IntegratorFeeToIntegrators]: "Markup paid to third-party integrators.",
    },
  },
};

export default adapter;

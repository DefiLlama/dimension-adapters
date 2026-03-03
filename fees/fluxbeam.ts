import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

const FEE_VAULTS = [
  'FLUXR4McuD2iXyP3wpP4XTjSWmB86ppMiyoA52UA9bKb',
  '4RNnWnJeyy6myqFW4anPDJtmhnZTdSMDo2HWjfBiDcLc',
];

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const fees = await getSolanaReceived({ options, targets: FEE_VAULTS });
  dailyFees.addBalances(fees, METRIC.PROTOCOL_FEES);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {   
      fetch,
      start: '2024-01-01',
    },
  },
  methodology: {
    Fees: 'Fees collected by FluxBeam fee vaults',
    Revenue: 'All fees collected by the protocol',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: 'All fees collected by FluxBeam fee vaults on Solana, retained entirely by the protocol',
    },
  },
};

export default adapter;
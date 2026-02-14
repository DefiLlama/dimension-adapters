import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from '../helpers/solidly';
import { METRIC } from "../helpers/metrics";

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Trading fees collected from token swaps on the DEX',
  },
  Revenue: {
    "Gauge emissions": 'Protocol revenue from gauge emissions distributed to voters',
  },
  HoldersRevenue: {
    "Gauge emissions": 'Gauge emissions distributed to veEQUAL token holders',
    "Bribes from other protocols": 'Bribes paid by external protocols to veEQUAL voters to direct emissions',
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getFeesExport({
        VOTER_ADDRESS: '0xE3D1A117dF7DCaC2eB0AC8219341bAd92f18dAC1',
        FACTORY_ADDRESS: '0xc6366EFD0AF1d09171fe0EBF32c7943BB310832a',
      }),
      start: '2022-12-09',
    },
    [CHAIN.SONIC]: {
      fetch: getFeesExport({
        VOTER_ADDRESS: '0x17fa9dA6e01aD59513707F92033a6eb03CcB10B4',
        FACTORY_ADDRESS: '0xDDD9845Ba0D8f38d3045f804f67A1a8B9A528FcC',
      }),
      start: '2024-12-11',
    },
  },
  breakdownMethodology,
};

export default adapter;

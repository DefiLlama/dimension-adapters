import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExport } from '../helpers/solidly';
import { METRIC } from "../helpers/metrics";

const VOTER_ADDRESS = '0x46ABb88Ae1F2a35eA559925D99Fdc5441b592687';
const FACTORY_ADDRESS = '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04';

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: 'Trading fees collected from token swaps on the DEX',
  },
  Revenue: {
    "Gauge emissions": 'Protocol revenue from gauge emissions distributed to voters',
  },
  HoldersRevenue: {
    "Gauge emissions": 'Gauge emissions distributed to veSCALE token holders',
    "Bribes from other protocols": 'Bribes paid by external protocols to veSCALE voters to direct emissions',
  }
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFeesExport({ FACTORY_ADDRESS, VOTER_ADDRESS,}),
      start: '2023-09-23',
    },
  },
  version: 2,
  breakdownMethodology,
};

export default adapter;
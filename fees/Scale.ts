import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFeesExportWithFilter } from '../helpers/solidly';

const VOTER_ADDRESS = '0x46ABb88Ae1F2a35eA559925D99Fdc5441b592687';
const FACTORY_ADDRESS = '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFeesExportWithFilter({ FACTORY_ADDRESS, VOTER_ADDRESS, APPLY_FILTER_POOLS_2: false }),
      start: '2023-09-23',
    },
  },
  version: 2,
};

export default adapter;
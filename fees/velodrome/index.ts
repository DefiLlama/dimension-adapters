import { Adapter, } from '../../adapters/types';
import { OPTIMISM } from '../../helpers/chains';
import { fetchV1 } from './velodrome';

const adapter: Adapter = {
  version: 2,
  adapter: {
    [OPTIMISM]: {
      fetch: fetchV1(),
      start: 1677110400, // TODO: Add accurate timestamp
    },
  },
};
export default adapter;

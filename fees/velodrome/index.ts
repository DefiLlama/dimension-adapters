import { Adapter, } from '../../adapters/types';
import { OPTIMISM } from '../../helpers/chains';
import { fetchV1 } from './velodrome';

const adapter: Adapter = {
  version: 2,
  adapter: {
    [OPTIMISM]: {
      fetch: fetchV1(),
      start: '2023-02-23', // TODO: Add accurate timestamp
    },
  },
};
export default adapter;

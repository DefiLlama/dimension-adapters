import { ETHER_ADDRESS } from '@defillama/sdk/build/general';
import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { commonAbi } from './abi';

const ROULETTE_ADDRESS = '0x94ba26ee118ef6c407c75dbb23385b1ad71a4547';
const PUMP_OR_REKT_ADDRESS = '0xcbc003cb76c5d218cba2dfb3a2b2f101950ed7e7';

async function fetch({ createBalances, api }: FetchOptions) {
  const totalFees = createBalances();

  const pumpOrRektFees = await api.call({
    abi: commonAbi[0],
    target: ROULETTE_ADDRESS,
  });

  const roulletteFees = await api.call({
    abi: commonAbi[0],
    target: PUMP_OR_REKT_ADDRESS,
  });

  totalFees.add(ETHER_ADDRESS, pumpOrRektFees);
  totalFees.add(ETHER_ADDRESS, roulletteFees);

  return { totalFees };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.FUSE]: {
      fetch,
      runAtCurrTime: true,
      start: 1720396800,
      meta: {
        methodology: {
          Fees: 'Sum of all fees from each game on the Demented Games platform.',
        },
      },
    },
  },
};

export default adapter;

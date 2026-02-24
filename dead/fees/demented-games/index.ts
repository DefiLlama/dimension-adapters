import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { commonAbi } from './abi';

const ROULETTE_ADDRESS = '0x94ba26ee118ef6c407c75dbb23385b1ad71a4547';
const PUMP_OR_REKT_ADDRESS = '0xcbc003cb76c5d218cba2dfb3a2b2f101950ed7e7';

async function fetch({ createBalances, fromApi, toApi }: FetchOptions) {
  const dailyFees = createBalances();
  const pumpOrRektFeesFrom = await fromApi.call({ abi: commonAbi[0], target: PUMP_OR_REKT_ADDRESS, });
  const pumpOrRektFeesTo = await toApi.call({ abi: commonAbi[0], target: PUMP_OR_REKT_ADDRESS, });
  const roulletteFeesFrom = await fromApi.call({ abi: commonAbi[0], target: ROULETTE_ADDRESS, });
  const roulletteFeesTo = await toApi.call({ abi: commonAbi[0], target: ROULETTE_ADDRESS, });

  const dailypumpOrRektFees = Number(pumpOrRektFeesTo) - Number(pumpOrRektFeesFrom);
  const dailyroulletteFees = Number(roulletteFeesTo) - Number(roulletteFeesFrom);
  const dailyTotal = dailypumpOrRektFees + dailyroulletteFees;
  dailyFees.addGasToken(dailyTotal);

  return { dailyFees, };
}

const adapter: Adapter = {
  version: 2,
  deadFrom: '2024-07-08',
  adapter: {
    [CHAIN.FUSE]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-07-08',
    },
  },
  methodology: {
    Fees: 'Sum of all fees from each game on the Demented Games platform.',
  },
};

export default adapter;

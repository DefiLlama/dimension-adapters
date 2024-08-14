import { ETHER_ADDRESS } from '@defillama/sdk/build/general';
import BigNumber from 'bignumber.js';
import { Adapter, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { commonAbi } from './abi';

const ROULETTE_ADDRESS = '0x94ba26ee118ef6c407c75dbb23385b1ad71a4547';
const PUMP_OR_REKT_ADDRESS = '0xcbc003cb76c5d218cba2dfb3a2b2f101950ed7e7';

const startDate = new Date('2024-07-26T00:00:00.000Z').getTime();
const currentDate = new Date().getTime();
const differenceInTime = currentDate - startDate;
const totalDays = Math.floor(differenceInTime / (1000 * 60 * 60 * 24));

async function fetch({ createBalances, api }: FetchOptions) {
  const totalFees = createBalances();
  const dailyFees = createBalances();

  const pumpOrRektFees = BigNumber(
    await api.call({
      abi: commonAbi[0],
      target: ROULETTE_ADDRESS,
    })
  );
  const roulletteFees = BigNumber(
    await api.call({
      abi: commonAbi[0],
      target: PUMP_OR_REKT_ADDRESS,
    })
  );

  const total = pumpOrRektFees.plus(roulletteFees);

  totalFees.add(ETHER_ADDRESS, total);
  dailyFees.add(ETHER_ADDRESS, total.dividedToIntegerBy(totalDays));

  return {
    totalFees,
    dailyFees,
  };
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

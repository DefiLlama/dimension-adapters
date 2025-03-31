/**
 * https://doc.saberdao.so/liquidity-flywheel
 * Swap Fees: Half the swap fees go to liquidity providers, adding another way to increase liquidity.
 * 
 * Fee Handling in Swap Operations:
 *
 * During a swap operation, the SwapData structure specifies the amount_in and the minimum_amount_out. 
 * The program calculates the output amount based on the current pool state and the swap curve. 
 * A portion of the input amount is allocated as a fee, which is distributed according to the pool's fee configuration. 
 * The net amount received by the user is the calculated output minus the fee. 
 * This ensures that fees are deducted directly from the transacted amounts, affecting the final amounts received or sent by users.
 *
 */

import { Adapter, ChainBlocks, FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { httpGet } from "../../utils/fetchURL";

async function fetchLast24hFees(timestamp: number, _: ChainBlocks, { createBalances }: FetchOptions) {
  const volumeData = await httpGet('https://raw.githubusercontent.com/saberdao/birdeye-data/refs/heads/main/volume.json');

  const dailyVolume = createBalances();

  for (const pool of Object.values(volumeData as Record<string, { v: number }>)) {
    dailyVolume.addUSDValue(pool.v);
  }

  return {
    dailyVolume,
  }
}


const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchLast24hFees,
      runAtCurrTime: true,
    },
  },
};

export default adapter;

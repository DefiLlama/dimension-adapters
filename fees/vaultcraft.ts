import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from '../helpers/token';

const fees_contract: any = {
    [CHAIN.ETHEREUM]: '0x47fd36ABcEeb9954ae9eA1581295Ce9A8308655E',
    [CHAIN.OPTIMISM]: '0x47fd36ABcEeb9954ae9eA1581295Ce9A8308655E'
}

const token_fees: any = {
    [CHAIN.ETHEREUM]: '0x40B74aC60F4133b31F297767B455B4328d917809',
    [CHAIN.OPTIMISM]: '0x297E1fCb68A7D1EDB7c9d2fDC782797E1c01E68e'
}
const fetchFees = async (options: FetchOptions) => {
    const _dailyFees = await addTokensReceived({ options, tokens: [token_fees[options.chain]], fromAddressFilter: ADDRESSES.null , target: fees_contract[options.chain] })
    const dailyFees = options.createBalances()
    Object.values(_dailyFees._balances).forEach(i => dailyFees.addGasToken(i))
    if (options.chain === CHAIN.ETHEREUM) {
        // burn
        const burn = await addTokensReceived({ 
            options, 
            token: '0xcE246eEa10988C495B4A90a905Ee9237a0f91543',
            targets: [ADDRESSES.null, '0x000000000000000000000000000000000000dEaD']
        })
        Object.values(burn._balances).forEach(i => dailyFees.addCGToken('vaultcraft', Number(i)/1e18))
    }
    return {
        dailyFees,
        dailyRevenue: dailyFees
    }
}


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees,
    },
  },
};

export default adapter;

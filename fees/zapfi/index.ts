import { Adapter,  } from "../../adapters/types";
import { FetchOptions } from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";

const withdrawABI = 'event Withdrawal(address to,bytes32 nullifierHash,address indexed relayer,uint256 fee)'

const ZAPFI_CONTRACTS = {
    [CHAIN.ARBITRUM]: {
      ETH: {
        pools: ['0x12A9C918008686b5dA394D127d57eC188729BA82'],
        token: ADDRESSES.null // Native ETH 
      },
      USDT: {
        pools: ['0xB3bE18D9264C0F51c1aed3f8823387f3F2Eb15d1'],
        token: ADDRESSES.arbitrum.USDT
      },
    }
}

interface ZapfiPoolData {
    pools: string[];
    token: string;
}

const getFees = async ({getLogs, chain, createBalances}: FetchOptions) => {
    const fees: { [token: string]: number } = {};

    for (const [token, data] of Object.entries(ZAPFI_CONTRACTS[chain]) as [string, ZapfiPoolData][]) {
        const feesPaid = await getLogs({
            targets: data.pools,
            eventAbi: withdrawABI,
        });
        fees[data.token] = feesPaid.reduce((sum, log) => sum + Number(log.fee), 0);
    }

    const dailyFees = createBalances();
    for (const [token, fee] of Object.entries(fees)) {
        dailyFees.add(token, fee);
    }
    
    return {dailyFees};
}

const methodology = {
    Fees: "All fees that are paid by users",
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFees,
      start: '2025-08-12',
      meta: {
        methodology
      }
    },
    // [CHAIN.ARBITRUM]: {
    //   fetch: getFeesExport(ArbitrumAddress, [event_withdrawal]),
    //   start: '2025-08-12',
    //   meta: {
    //     methodology: {
    //       Fees: "Fees paid by users when transfer out from protocol.",
    //       Revenue: "Fees earn by protocol.",
    //     }
    //   }
    // },
  },
}

export default adapter;

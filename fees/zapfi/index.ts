import { Adapter,  } from "../../adapters/types";
import { FetchOptions } from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";

interface IPool {
  poolAddress: string;
  token: string;
}

const ZAPFI_CONTRACTS: {[key: string]: Array<IPool>} = {
  [CHAIN.ARBITRUM]: [
    {
      poolAddress: '0x12A9C918008686b5dA394D127d57eC188729BA82',
      token: ADDRESSES.null,
    },
    {
      poolAddress: '0xB3bE18D9264C0F51c1aed3f8823387f3F2Eb15d1',
      token: ADDRESSES.arbitrum.USDT,
    },
  ],
}

const WithdrawalEvent = 'event Withdrawal(address to,bytes32 nullifierHash,address indexed relayer,uint256 fee)'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()

  for (const pool of ZAPFI_CONTRACTS[options.chain]) {
    const events = await options.getLogs({
      eventAbi: WithdrawalEvent,
      target: pool.poolAddress,
    });

    for (const event of events) {
      dailyFees.add(pool.token, event.fee)
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "All fees that are paid by users by depositing in privacy pools",
  Revenue: "All fees are collected as revenue",
  ProtocolRevenue: "All fees are collected by protocol",
}

const adapter: Adapter = {
  version: 2,
  methodology,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2025-08-12',
}

export default adapter;

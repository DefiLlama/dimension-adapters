import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const topic_0 = '0xd0c3c799bf9e2639de44391e7f524d229b2b55f5b1ea94b2bf7da42f7243dddd';
type IContractAddress = {
  [k: string]: string[];
}
interface ILog {
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed: boolean;
  address: string;
  data: string;
  topics: string[];
}

const contract_address: IContractAddress = {
  [CHAIN.ETHEREUM]: [
    '0x35F0ca9Be776E4B38659944c257bDd0ba75F1B8B',
    '0x86b47d8411006874eef8e4584bdfd7be8e5549d1',
    '0xf538da6c673a30338269655f4e019b71ba58cfd4',
    '0xcbe7e5da76dc99ac317adf6d99137005fda4e2c4',
    '0x925228d7b82d883dde340a55fe8e6da56244a22c',
    '0xe2c2ab221aa0b957805f229d2aa57fbe2f4dadf7',
    '0x91d25a56db77ad5147437d8b83eb563d46ebfa69',
    '0x3df8dae2d123081c4d5e946e655f7c109b9dd630',
    '0xffBD6B0146C9E16A9f9E77DC8898cbfF6E2AA389'
  ],
  [CHAIN.ARBITRUM]: [
    '0x122f05f49e90508f089ee8d0d868d1a4f3e5a809',
    '0x66a0046ac9fa104eb38b04cff391ccd0122e6fbc',
    '0x77b60f85b25fd501e3dded6c1fe7bf565c08a22a',
    '0xc09b72e8128620c40d89649019d995cc79f030c3',
    '0x79f3abece5a3afff32d47f4cfe45e7b65c9a2d91',
    '0x05b723f3db92430fbe4395fd03e40cc7e9d17988',
    '0xce11020d56e5fdbfe46d9fc3021641ffbbb5adee',
  ],
  [CHAIN.OPTIMISM]: [
    '0x0c9be7cfd12c735e5aae047c1dcb845d54e518c3',
    '0x55183db1d2ae0b63e4c92a64bef2cbfc2032b127',
    '0xa3c9544b82846c45be37593d5d9acffbe61bf3a6',
    '0x82e9f4c5ec4a84e310d60d462a12042e5cba0954',
    '0x0b1760a8112183303c5526c6b24569fd3a274f3b',
    '0x6b57145e322c877e7d91ed8e31266eb5c02f7efc',
    '0xd0d3e757bfbce7ae1881ddd7f6d798ddce588445',
  ],
  [CHAIN.BSC]: [
    '0x1467ff8f249f5bc604119af26a47035886f856be',
    '0x2788b46bacff49bd89562e6ba5c5fbbbe5fa92f7',
    '0x6aa72a998859ef93356c6521b72155d355d0cfd2',
    '0x0bf40b034872d0b364f3dcec04c7434a4da1c8d9',
    '0x6bd4754d86fc87fe5b463d368f26a3587a08347c',
    '0x70bc7f7a6d936b289bbf5c0e19ece35b437e2e36',
    '0x4feb11a454c9e8038a8d0adf599fe7612ce114ba',
  ],
  [CHAIN.BASE]: [
    '0xd952feacdd5919cc5e9454b53bf45d4e73dd6457',
    '0x1e5ca70d1e7a1b26061125738a880bbea42feb21',
    '0x3db8bea142e41ca3633890d0e5640f99a895d6a5',
    '0xdd4fb402d41beb0eeef6cfb1bf445f50bdc8c981',
    '0xbe5a9e336d9614024b4fa10d8112671fc9a42d96',
    '0xdea286dc0e01cb4755650a6cf8d1076b454ea1cb',
  ],
  [CHAIN.POLYGON]: [
    '0x5fa30697e90eb30954895c45b028f7c0ddd39b12',
    '0x3111cfbf5e84b5d9bd952dd8e957f4ca75f728cf',
    '0xfd77c53aa4ef0e3c01f5ac012bf7cc7a3ecf5168',
    '0x20b028a2e0f6cce3a11f3ce5f2b8986f932e89b4',
    '0xd16d025330edb91259eea8ed499dacd39087c295',
    '0x5060ef647a1f66be6ee27fae3046faf8d53ceb2d',
    '0x4616621704c81801a56d29c961f9395ee153d46c',
    '0xf5b5a2fc11bf46b1669c3b19d98b19c79109dca9',
  ],
  [CHAIN.AVAX]: [
    '0xd0701fcc7818c31935331b02eb21e91ec71a1704',
    '0x97500490d9126f34cf9aa0126d64623e170319ef',
    '0x9b1ed9de069be4d50957464b359f98ed0bf34dd5',
    '0x98f51b041e493fc4d72b8bd33218480ba0c66ddf',
    '0x268fb4311d2c6cb2bba01cca9ac073fb3bfd1c7c',
    '0x8629008887e073260c5434d6cacfc83c3001d211',
    '0x8eaae6462816cb4957184c48b86afa7642d8bf2b',
  ],
  [CHAIN.MONAD]: [
    '0xb39B7D0cdd79B94B08b334965C1720be51A31986',
  ],
}


const fetchFees = async (options: FetchOptions): Promise<FetchResultV2> => {
    const logs: ILog[] = await options.getLogs({
      topic: topic_0,
      targets: contract_address[options.chain],
    });
    const rawData = logs.map((log: ILog) => {
      const data = log.data.replace('0x', '');
      const amount = Number('0x' + data.slice((9 * 64), (9 * 64) + 64));
      const address = data.slice((8 * 64), (8 * 64) + 64);
      const addressString = `0x${address.slice(24)}`;
      return {
        amount: amount,
        address: addressString,
      }
    });
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    rawData.map((data: any) => {
      dailyFees.add(data.address, data.amount);
    });

    return {
      dailyFees,
      dailyRevenue
    };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: '2023-07-05',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: '2023-07-05',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees,
      start: '2023-07-05',
    },
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: '2023-07-05',
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2023-07-05',
    },
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: '2023-07-05',
    },
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: '2023-07-05',
    },
    [CHAIN.MONAD]: {
      fetch: fetchFees,
      start: '2025-11-24',
    },
  }
}

export default adapter;

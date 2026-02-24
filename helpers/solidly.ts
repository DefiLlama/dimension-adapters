import ADDRESSES from './coreAssets.json'
import { BaseAdapter, FetchOptions, IJSON, SimpleAdapter, } from "../adapters/types";
import { createFactoryExports } from "../factory/registry";
import { CHAIN } from "./chains";
import { filterPools2 } from './uniswap';

const TOPIC_Notify = 'event NotifyReward(address indexed from, address indexed reward, uint indexed epoch, uint amount)';

type TABI = {
  [k: string]: string;
}
const ABIs: TABI = {
  "allPairsLength": "uint256:allPairsLength",
  "allPairs": "function allPairs(uint256) view returns (address)"
}

const VOTER_ABI: TABI = {
  "length": "uint256:length",
  "pools": "function pools(uint256) view returns (address)",
  "gauges": "function gauges(address) view returns (address)",
  "bribes": "function bribes(address) view returns (address)"
}

export function getFeesExport({ VOTER_ADDRESS, FACTORY_ADDRESS,  }: { VOTER_ADDRESS: string, FACTORY_ADDRESS: string, }) {
  return async (fetchOptions: FetchOptions) => {
    const { api, getLogs, createBalances, } = fetchOptions

    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    const dailyBribesRevenue = createBalances()

    let lpTokens = await api.fetchList({ lengthAbi: ABIs.allPairsLength, itemAbi: ABIs.allPairs, target: FACTORY_ADDRESS });

    let [token0s, token1s] = await Promise.all(
      ['address:token0', 'address:token1'].map((method) => api.multiCall({ abi: method, calls: lpTokens, }))
    );
    const allLPTokens = lpTokens

    const res = await filterPools2({ fetchOptions, pairs: lpTokens, token0s, token1s })
    lpTokens = res.pairs
    token0s = res.token0s
    token1s = res.token1s


    const poolsGauges = await api.multiCall({ abi: VOTER_ABI.gauges, target: VOTER_ADDRESS, calls: allLPTokens, });

    const voterGauges = poolsGauges.filter((_vg: string) => _vg !== ADDRESSES.null);

    const voterBribes = await api.multiCall({ abi: VOTER_ABI.bribes, target: VOTER_ADDRESS, calls: voterGauges, });


    const tradefeeLogs = await getLogs({
      targets: lpTokens,
      flatten: false,
      eventAbi: 'event Fees (address indexed sender, uint256 amount0, uint256 amount1)'
    })

    const bribeAndFeeLogs = await getLogs({ targets: voterBribes, eventAbi: TOPIC_Notify, flatten: false, })
    bribeAndFeeLogs.forEach((e: any, idx: number) => {
      const voterGauge = voterGauges[idx].toLowerCase()
      e.forEach((l: any) => {
        if (l.from.toLowerCase() !== voterGauge)
          dailyBribesRevenue.add(l.reward, l.amount)
        else
          dailyRevenue.add(l.reward, l.amount)

      })
    })

    lpTokens.map((_: string, index: number) => {
      const token0 = token0s[index]
      const token1 = token1s[index]
      tradefeeLogs[index]
        .map((p: any) => {
          dailyFees.add(token0, p.amount0)
          dailyFees.add(token1, p.amount1)
        })
    });

    return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue, dailyBribesRevenue, };
  }
}

type SolidlyChainConfig = {
  voterAddress: string;
  factoryAddress: string;
  start?: string;
}

function solidlyFeesExports(config: IJSON<SolidlyChainConfig>, overrides?: Partial<SimpleAdapter>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getFeesExport({ VOTER_ADDRESS: chainConfig.voterAddress, FACTORY_ADDRESS: chainConfig.factoryAddress }),
      start: chainConfig.start,
    }
  })
  return { version: 2, adapter: exportObject, pullHourly: true, ...overrides } as SimpleAdapter
}

const solidlyEntries: Record<string, any> = {
  "equalizer-exchange": {
    [CHAIN.FANTOM]: { voterAddress: '0xE3D1A117dF7DCaC2eB0AC8219341bAd92f18dAC1', factoryAddress: '0xc6366EFD0AF1d09171fe0EBF32c7943BB310832a', start: '2022-12-09' },
    [CHAIN.SONIC]: { voterAddress: '0x17fa9dA6e01aD59513707F92033a6eb03CcB10B4', factoryAddress: '0xDDD9845Ba0D8f38d3045f804f67A1a8B9A528FcC', start: '2024-12-11' },
  },
  "Scale": {
    [CHAIN.BASE]: { voterAddress: '0x46ABb88Ae1F2a35eA559925D99Fdc5441b592687', factoryAddress: '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04', start: '2023-09-23' },
  },
}

const protocols = {} as any;
Object.entries(solidlyEntries).forEach(([protocolName, entry]: [string, any]) => {
  if (entry.chainConfig) {
    const { chainConfig, ...overrides } = entry
    protocols[protocolName] = solidlyFeesExports(chainConfig, overrides)
  } else {
    protocols[protocolName] = solidlyFeesExports(entry)
  }
})

export const { protocolList, getAdapter } = createFactoryExports(protocols);

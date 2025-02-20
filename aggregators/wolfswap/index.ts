import { ChainBlocks, FetchOptions } from "../../adapters/types";

const abis = {
  "Swapped": "event Swapped(uint indexed id, address wallet, address sourceToken, address destinationToken, uint amountOut)",
}

const contracts = {
  polygon: '0x9fB5f7Bc34cEd4dE039405D7bE26CbF1D0a420d9',
  cronos: '0xeC68090566397DCC37e54B30Cc264B2d68CF0489',
  cronos_zkevm: '0x7c39eAcCd16cDAD8BFE05e1874da1BD315DB766F',
  base: '0xE6174feAD698da575312ae85020A3224E556f8F9',
  avax: '0x643dEB007DfA43c0D7BeA2155E97E61279d9a56F',
  sei: '0x1AD805e80b59C802f9D8059f904DCA6AC153de30',
  blast: '0xb86a6e5702C327c5C051Bf5323Cb2bAb5E628d0c',
  sonic: '0x222680A4fCcFE131acAf7a26301FC929364a881E',
  abstract: '0x74bAf6450B8E862Ed8daAE385E12704E4882927A',
}

const fetch = async (timestamp: number, _: ChainBlocks, { createBalances, getLogs, chain, api }: FetchOptions) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: contracts[chain], eventAbi: abis.Swapped, })
  logs.forEach((log: any) => {
    dailyVolume.add(log.destinationToken, log.amountOut)
  })
  return { timestamp, dailyVolume }
};

const adapter: any = {
  adapter: {
    polygon: { fetch, start: '2024-03-20', },
    cronos: { fetch, start: '2024-03-24', },
    cronos_zkevm: { fetch, start: '2024-06-19', },
    base: { fetch, start: '2024-04-14', },
    avax: { fetch, start: '2024-05-31', },
    //sei: { fetch, start: '2024-05-31', },
    blast: { fetch, start: '2024-03-07', },
    sonic: { fetch, start: '2024-12-16', },
    abstract: { fetch, start: '2025-01-27', },
  },
};

export default adapter;

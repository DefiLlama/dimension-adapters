import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const abis = {
  "Swapped": "event Swapped(uint indexed id, address wallet, address sourceToken, address destinationToken, uint amountOut)",
}

const contracts: Record<string, string> = {
  [CHAIN.POLYGON]: '0x9fB5f7Bc34cEd4dE039405D7bE26CbF1D0a420d9',
  [CHAIN.CRONOS]: '0xeC68090566397DCC37e54B30Cc264B2d68CF0489',
  [CHAIN.CRONOS_ZKEVM]: '0x7c39eAcCd16cDAD8BFE05e1874da1BD315DB766F',
  [CHAIN.BASE]: '0xE6174feAD698da575312ae85020A3224E556f8F9',
  [CHAIN.AVAX]: '0x643dEB007DfA43c0D7BeA2155E97E61279d9a56F',
  [CHAIN.SEI]: '0x1AD805e80b59C802f9D8059f904DCA6AC153de30',
  [CHAIN.BLAST]: '0xb86a6e5702C327c5C051Bf5323Cb2bAb5E628d0c',
  [CHAIN.SONIC]: '0x222680A4fCcFE131acAf7a26301FC929364a881E',
  [CHAIN.ABSTRACT]: '0x74bAf6450B8E862Ed8daAE385E12704E4882927A',
}

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: contracts[chain], eventAbi: abis.Swapped, })
  logs.forEach((log: any) => {
    dailyVolume.add(log.destinationToken, log.amountOut)
  })
  return { dailyVolume }
};

const adapter: any = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: { fetch, start: '2024-03-20', },
    [CHAIN.CRONOS]: { fetch, start: '2024-03-24', },
    [CHAIN.CRONOS_ZKEVM]: { fetch, start: '2024-06-19', },
    [CHAIN.BASE]: { fetch, start: '2024-04-14', },
    [CHAIN.AVAX]: { fetch, start: '2024-05-31', },
    //[CHAIN.SEI]: { fetch, start: '2024-05-31', },
    [CHAIN.BLAST]: { fetch, start: '2024-03-07', },
    [CHAIN.SONIC]: { fetch, start: '2024-12-16', },
    [CHAIN.ABSTRACT]: { fetch, start: '2025-01-27', },
  },
};

export default adapter;

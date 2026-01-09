import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const rainFactory = "0xccCB3C03D9355B01883779EF15C1Be09cf3623F1"
const enterOptionEvent = "event EnterOption(uint256 option, uint256 baseAmount, uint256 optionAmount,address indexed wallet)"
const PoolCreatedEvent = "event PoolCreated(address indexed poolAddress, address indexed poolCreator, string uri)"


export async function getPools(options: FetchOptions) {
  const poolCreationLogs = await options.getLogs({ target: rainFactory, eventAbi: PoolCreatedEvent, fromBlock: 307026817, cacheInCloud: true })
  const pools = poolCreationLogs.map(log => log.poolAddress.toLowerCase())
  return pools
}

export async function processLogs({
  options, pools, processor, eventAbi,
}: { options: FetchOptions, pools: string[], processor: any, eventAbi: string }) {
  return options.streamLogs({
    noTarget: true,
    eventAbi,
    entireLog: true,
    targetsFilter: pools,
    processor
  })
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const pools = await getPools(options)
  const baseTokens = await options.api.multiCall({ abi: 'address:baseToken', calls: pools })
  const poolToBaseToken: Record<string, string> = {}
  pools.forEach((pool, i) => {
    poolToBaseToken[pool] = baseTokens[i]
  })

  const processor = (logs: any) => {
    logs.forEach((log: any) => {
      const pool = log.address.toLowerCase()
      const baseToken = poolToBaseToken[pool]

      if (!baseToken) {
        console.warn(`No base token for pool ${pool}`)
        return;
      }

      dailyVolume.add(baseToken, log.args.baseAmount)
    })
  }

  await processLogs({ options, pools, processor, eventAbi: enterOptionEvent })


  return { dailyVolume, }
};

const methodology = {
  Volume: "All trades on prediction markets",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: "2025-02-17",
  methodology
};

export default adapter;
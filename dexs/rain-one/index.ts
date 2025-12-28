import { ethers } from "ethers";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json";
import * as sdk from "@defillama/sdk"

const usdt = coreAssets.arbitrum.USDT
const rainFactory = "0xccCB3C03D9355B01883779EF15C1Be09cf3623F1"
const enterOptionEvent = "event EnterOption(uint256 option, uint256 baseAmount, uint256 optionAmount,address indexed wallet)"
const PoolCreatedEvent = "event PoolCreated(address indexed poolAddress, address indexed poolCreator, string uri)"


const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();
    const cacheKey = `tvl-adapter-cache/cache/logs/${options.chain}/${rainFactory.toLowerCase()}.json`
    const { logs } = await sdk.cache.readCache(cacheKey, { readFromR2Cache: true})
    const iface = new ethers.Interface([PoolCreatedEvent])
    const pools = logs.map((log: any) => iface.parseLog(log)?.args.poolAddress)
    const enterOptionLogs = await options.getLogs({
      targets: pools,
      eventAbi: enterOptionEvent
    })
    enterOptionLogs.forEach(log => dailyVolume.add(usdt, log.baseAmount))

    return {
        dailyVolume,
    };
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
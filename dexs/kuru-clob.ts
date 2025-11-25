import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances();
  
  const logs = await options.getLogs({
    target: '0x122C0D8683Cab344163fB73E28E741754257e3Fa',
    eventAbi: 'event Trade (uint40 orderId, address makerAddress, bool isBuy, uint256 price, uint96 updatedSize, address takerAddress, address txOrigin, uint96 filledSize)',
  })
  
  for (const log of logs) {
    // _pricePrecision 18
    // _sizePrecision 11
    dailyVolume.addUSDValue(BigInt(log.price) * BigInt(log.filledSize) / BigInt(1e29))
  }
  
  return {
    dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.MONAD],
}

export default adapter;

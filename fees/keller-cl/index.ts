import { uniV3Exports } from "../../helpers/uniswap";

const customLogic = async ({ pairObject, dailyFees, fetchOptions, filteredPairs, }: any) => {
  const collectProtocolEvent = 'event CollectProtocol(address indexed sender,address indexed recipient,uint128 amount0,uint128 amount1)';
  const { createBalances, getLogs } = fetchOptions
  const dailyProtocolRevenue = createBalances();

  await Promise.all(Object.keys(filteredPairs).map(async (pair) => {
    const [token0, token1] = pairObject[pair]
    const logs = await getLogs({ target: pair, eventAbi: collectProtocolEvent })

    logs.forEach(log => {
      dailyProtocolRevenue.add(token0, log.amount0)
      dailyProtocolRevenue.add(token1, log.amount1)
    })
  }))
  return {
    dailyFees,
    dailyProtocolRevenue,
  };
}

export default uniV3Exports({
  scroll: {
    factory: '0x952aC46B2586737df679e836d9B980E43E12B2d8',
    customLogic,
  }
})
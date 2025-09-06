import ADDRESSES from '../helpers/coreAssets.json'
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import * as sdk from "@defillama/sdk";

// kelp get rewards from ETH and reward tokens (EIGEN, ...) from EigenLayer restaking
const methodology = {
  Fees: 'Total rewards were collected from staking assets.',
  SupplySideRevenue: 'Rewards are distributed to stakers (rsETH holders).',
  Revenue: 'A portion of rewards are charged by protocol.',
  ProtocolRevenue: 'A portion of rewards are charged by protocol.',
}

const LRTOracle = '0x349A73444b1a310BAe67ef67973022020d70020d'
const LRTConfig = '0x947Cb49334e6571ccBFEF1f1f1178d8469D65ec7'
const EigenRewardDistributor = '0x9bb6d4b928645eda8f9c019495695ba98969eff1'
const EigenToken = ADDRESSES.ethereum.EIGEN

const rsETHMaps: any = {
  [CHAIN.ETHEREUM]: '0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7',
  [CHAIN.ARBITRUM]: ADDRESSES.berachain.rsETH,
  [CHAIN.BLAST]: ADDRESSES.berachain.rsETH,
  [CHAIN.SCROLL]: '0x65421ba909200b81640d98b979d07487c9781b66',
  [CHAIN.OPTIMISM]: ADDRESSES.berachain.rsETH,
  [CHAIN.BASE]: '0x1Bc71130A0e39942a7658878169764Bbd8A45993',
  [CHAIN.LINEA]: ADDRESSES.berachain.rsETH,
  [CHAIN.ERA]: '0x6be2425c381eb034045b527780d2bf4e21ab7236',
}

const Abis = {
  protocolFeeInBPS: 'uint256:protocolFeeInBPS',
  rsETHPrice: 'uint256:rsETHPrice',
  totalSupply: 'uint256:totalSupply',
  feeInBPS: 'uint256:feeInBPS',
  ClaimedEvent: 'event Claimed(uint256 index, address account, uint256 amount)',
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  // get corresponding block on ethereum chain
  const beforeBlock = await sdk.util.blocks.getBlock(CHAIN.ETHEREUM, options.fromTimestamp)
  const afterBlock = await sdk.util.blocks.getBlock(CHAIN.ETHEREUM, options.toTimestamp)

  // get rsETH prices on Ethereum
  const rsETHPriceBefore = await sdk.api2.abi.call({
    chain: CHAIN.ETHEREUM,
    target: LRTOracle,
    abi: Abis.rsETHPrice,
    block: beforeBlock.number,
  })
  const rsETHPriceAfter = await sdk.api2.abi.call({
    chain: CHAIN.ETHEREUM,
    target: LRTOracle,
    abi: Abis.rsETHPrice,
    block: afterBlock.number,
  })

  // get protocol fee rate config
  let protocolFeeRate = 0
  try {
    const protocolFeeInBPS = await sdk.api2.abi.call({
      chain: CHAIN.ETHEREUM,
      target: LRTConfig,
      abi: Abis.protocolFeeInBPS,
      block: beforeBlock.number,
    });
    protocolFeeRate = Number(protocolFeeInBPS) / 1e4
  } catch (e: any) { }

  const totalSupply = await options.api.call({
    target: rsETHMaps[options.chain],
    abi: Abis.totalSupply,
  })

  const priceGrowth = Number(rsETHPriceAfter) - Number(rsETHPriceBefore)
  const totalFees = Number(totalSupply) * priceGrowth / (1 - protocolFeeRate) / 1e18
  const protocolRevenue = totalFees * protocolFeeRate
  const supplySideRevenue = totalFees - protocolRevenue

  dailyFees.addGasToken(totalFees)
  dailyProtocolRevenue.addGasToken(protocolRevenue)
  dailySupplySideRevenue.addGasToken(supplySideRevenue)

  if (options.chain === CHAIN.ETHEREUM) {
    const claimedEvents: Array<any> = await options.getLogs({
      target: EigenRewardDistributor,
      eventAbi: Abis.ClaimedEvent,
    })
    if (claimedEvents.length > 0) {
      const feeInBPS = await options.api.call({
        target: EigenRewardDistributor,
        abi: Abis.feeInBPS,
      });
      const feeRate = Number(feeInBPS) / 1e4
      for (const event of claimedEvents) {
        const amount = Number(event.amount)
        dailyFees.add(EigenToken, amount)
        dailyProtocolRevenue.add(EigenToken, amount * feeRate)
        dailySupplySideRevenue.add(EigenToken, amount * (1 - feeRate))
      }
    }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevneue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-12-11', },
    [CHAIN.ARBITRUM]: { start: '2024-02-07', },
    [CHAIN.BLAST]: { start: '2024-03-20', },
    [CHAIN.SCROLL]: { start: '2024-03-26', },
    [CHAIN.OPTIMISM]: { start: '2024-04-06', },
    [CHAIN.BASE]: { start: '2024-04-06', },
    [CHAIN.LINEA]: { start: '2024-04-16', },
    [CHAIN.ERA]: { start: '2024-05-16', },
  },
};

export default adapter;

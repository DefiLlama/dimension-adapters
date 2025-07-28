import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, } from '../../adapters/types';
import { addTokensReceived } from '../../helpers/token';

const totalFee = 9.5;
const strategistFee = 0.5;
const callFee = 0.01;
const revenueFee = totalFee - strategistFee - callFee;
const holderShare = 36;
const protocolShare = 64;

const defaultTargets = ['0x02ae4716b9d5d48db1445814b0ede39f5c28264b']
const config: any = {
  arbitrum: { start: '2023-09-06', tokens: [ADDRESSES.arbitrum.USDC_CIRCLE], fromAddressFilter: '0x5f98f630009E0E090965fb42DDe95F5A2d495445' },
  base: { start: '2023-08-25', tokens: [ADDRESSES.base.USDbC], fromAddressFilter: '0x02ae4716b9d5d48db1445814b0ede39f5c28264b' },
  polygon: { start: '2023-09-06', tokens: [ADDRESSES.polygon.USDC], logFilter: polygonLogFilter },
  avax: { start: '2023-09-06', tokens: [ADDRESSES.avax.USDC], },
  optimism: { start: '2023-08-25', tokens: [ADDRESSES.optimism.USDC], },
  bsc: { start: '2023-08-25', tokens: [ADDRESSES.bsc.USDT], },
  ethereum: { start: '2023-08-25', tokens: [ADDRESSES.ethereum.USDC], targets: ['0x65f2145693bE3E75B8cfB2E318A3a74D057e6c7B'], logFilter: ethereumLogFilter, },
  linea: { start: '2024-03-10', tokens: [ADDRESSES.linea.USDC], },
}

const blacklistedPolygonFromAddress = [
  '0x8f5bbb2bb8c2ee94639e55d5f41de9b4839c1280',
  '0xc0d173e3486f7c3d57e8a38a003500fd27e7d055',
  '0x4fed5491693007f0cd49f4614ffc38ab6a04b619',
  '0x161d61e30284a33ab1ed227bedcac6014877b3de',
]
const blacklistedPolygonFromAddressSet = new Set(blacklistedPolygonFromAddress.map((address: string) => address.toLowerCase()))

function polygonLogFilter(log: any) {
  return !blacklistedPolygonFromAddressSet.has(log.from.toLowerCase())
}

const blacklistedEthereumFromAddress = [
  ADDRESSES.null,
  '0x504A330327A089d8364C4ab3811Ee26976d388ce',
]
const blacklistedEthereumFromAddressSet = new Set(blacklistedEthereumFromAddress.map((address: string) => address.toLowerCase()))

function ethereumLogFilter(log: any) {
  return !blacklistedEthereumFromAddressSet.has(log.from.toLowerCase())
}

const methodology = {
  Fees: `Staking yields from Beefy Finance vaults`,
  Revenue: `All fees except for ${strategistFee}% to strategist and variable harvest() call fee are revenue`,
  HoldersRevenue: `${holderShare}% of revenue is distributed to holders who stake`,
  ProtocolRevenue: `${protocolShare}% of revenue is distributed to the treasury`,
};

const fetch = async (options: FetchOptions) => {
  const { targets = defaultTargets, fromAddressFilter, tokens, logFilter, } = config[options.chain]
  const dailyRevenue = await addTokensReceived({ options, targets, fromAddressFilter, tokens, logFilter, })
  const dailyFees = dailyRevenue.clone(100 / totalFee);
  const dailyProtocolRevenue = dailyRevenue.clone(protocolShare / 100);
  const dailyHoldersRevenue = dailyRevenue.clone(holderShare / 100);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, }
}

const adapter: any = {}

Object.keys(config).forEach(chain => {
  adapter[chain] = {
    start: config[chain].start,
    meta: { methodology },
    fetch
  }
})

export default {
  version: 2,
  adapter,
}

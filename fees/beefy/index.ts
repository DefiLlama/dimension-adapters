import { FetchOptions, } from '../../adapters/types';
import { addTokensReceived } from '../../helpers/token';

const totalFee = 9.5;
const strategistFee = 0.5;
const callFee = 0.01;
const revenueFee = totalFee - strategistFee - callFee;
const holderShare = 36;
const protocolShare = 64;

const methodology = {
  Fees: `${totalFee}% of each harvest is charged as a performance fee`,
  Revenue: `All fees except for ${strategistFee}% to strategist and variable harvest() call fee are revenue`,
  HoldersRevenue: `${holderShare}% of revenue is distributed to holders who stake`,
  ProtocolRevenue: `${protocolShare}% of revenue is distributed to the treasury`,
};

const defaultTargets = ['0x02ae4716b9d5d48db1445814b0ede39f5c28264b']
const adapter: any = {}
const config: any = {
  arbitrum: { start: 1693958400, tokens: ['0xaf88d065e77c8cc2239327c5edb3a432268e5831'], fromAddressFilter: '0x5f98f630009E0E090965fb42DDe95F5A2d495445' },
  base: { start: 1692921600, tokens: ['0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA'], fromAddressFilter: '0x02ae4716b9d5d48db1445814b0ede39f5c28264b'},
  polygon: { start: 1693958400, tokens: ['0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'], logFilter: polygonLogFilter},
  avax: { start: 1693958400, tokens: ['0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E'], },
  optimism: { start: 1692921600, tokens: ['0x7F5c764cBc14f9669B88837ca1490cCa17c31607'], },
  bsc: { start: 1692921600, tokens: ['0x55d398326f99059fF775485246999027B3197955'], },
  ethereum: { start: 1692921600, tokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'], targets: ['0x65f2145693bE3E75B8cfB2E318A3a74D057e6c7B'],  logFilter: ethereumLogFilter, },
  linea: { start: 1710028800, tokens: ['0x176211869cA2b568f2A7D4EE941E073a821EE1ff'], },
}

Object.keys(config).forEach(chain => {
  const { start, targets = defaultTargets, fromAddressFilter, tokens, logFilter, } = config[chain]
  adapter[chain] = {
    start,
    meta: { methodology },
    fetch: async (options: FetchOptions) => {
      const dailyRevenue = await addTokensReceived({ options, targets, fromAddressFilter, tokens, logFilter, })
      const dailyFees = dailyRevenue.clone(totalFee / revenueFee);
      const dailyProtocolRevenue = dailyRevenue.clone(protocolShare / 100);
      const dailyHoldersRevenue = dailyRevenue.clone(holderShare / 100);
      return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, }
    }
  }
})

export default {
  version: 2,
  adapter,
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
  '0x0000000000000000000000000000000000000000',
  '0x504A330327A089d8364C4ab3811Ee26976d388ce',
]
const blacklistedEthereumFromAddressSet = new Set(blacklistedEthereumFromAddress.map((address: string) => address.toLowerCase()))

function ethereumLogFilter(log: any) {
  return !blacklistedEthereumFromAddressSet.has(log.from.toLowerCase())
}

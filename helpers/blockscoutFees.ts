import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from '../adapters/types';
import { httpGet } from '../utils/fetchURL';
import { CHAIN } from './chains';
import { getEnv } from './env';

export const chainConfigMap: any = {
  [CHAIN.FANTOM]: { explorer: 'https://ftmscout.com', CGToken: 'fantom', },
  [CHAIN.CELO]: { explorer: 'https://celo.blockscout.com', CGToken: 'celo', allStatsApi: 'https://stats-celo-mainnet.k8s-prod-2.blockscout.com' },
  [CHAIN.AURORA]: { explorer: 'https://aurorascan.dev', allStatsApi: 'https://stats.explorer.mainnet.aurora.dev', CGToken: 'ethereum' },
  [CHAIN.XDAI]: { explorer: 'https://blockscout.com/xdai/mainnet', CGToken: 'dai', allStatsApi: 'https://stats-gnosis-mainnet.k8s-prod-1.blockscout.com', start: '2018-11-01' },
  [CHAIN.CANTO]: { explorer: 'https://explorer.plexnode.wtf', CGToken: 'canto', },
  [CHAIN.CRONOS]: { explorer: 'https://cronos.org/explorer', CGToken: 'crypto-com-chain', },
  [CHAIN.MIXIN]: { explorer: 'https://scan.mvm.dev', CGToken: 'mixin' },
  [CHAIN.ENERGYWEB]: { explorer: 'https://explorer.energyweb.org', CGToken: 'energy-web-token' },
  [CHAIN.IMX]: { explorer: 'https://explorer.immutable.com', CGToken: 'immutable-x', allStatsApi: 'https://stats-immutable-mainnet.k8s.blockscout.com' },
  [CHAIN.ZETA]: { explorer: 'https://zetachain.blockscout.com', CGToken: 'zetachain' },
  [CHAIN.ETHERLINK]: { explorer: 'https://explorer.etherlink.com', CGToken: 'tezos', allStatsApi: 'https://stats-etherlink-mainnet.k8s-prod-1.blockscout.com' },
  [CHAIN.REDSTONE]: { explorer: 'https://explorer.redstone.xyz', CGToken: 'ethereum', allStatsApi: 'https://stats-redstone.k8s.blockscout.com' },
  [CHAIN.SHIMMER_EVM]: { explorer: 'https://explorer.evm.shimmer.network', CGToken: 'shimmer' },
  [CHAIN.FLARE]: { explorer: 'https://flare-explorer.flare.network', CGToken: 'flare-networks' },
  [CHAIN.KARDIA]: { explorer: 'https://explorer.kardiachain.io', CGToken: 'kardiachain' },
  [CHAIN.ROOTSTOCK]: { explorer: 'https://rootstock.blockscout.com', CGToken: 'rootstock', allStatsApi: 'https://stats-rsk-mainnet.k8s-prod-2.blockscout.com' },
  [CHAIN.TELOS]: { explorer: 'https://telostx.com', CGToken: 'telos' },
  [CHAIN.ETHEREUM_CLASSIC]: { explorer: 'https://etc.blockscout.com', CGToken: 'ethereum-classic', },
  [CHAIN.SYSCOIN]: { explorer: 'https://explorer.syscoin.org', CGToken: 'syscoin', },
  
  [CHAIN.VELAS]: { explorer: 'https://evmexplorer.velas.com', CGToken: 'velas' },
  [CHAIN.NULS]: { explorer: 'https://evmscan.nuls.io', CGToken: 'nuls' },
  [CHAIN.FUSE]: { explorer: 'https://explorer.fuse.io', CGToken: 'fuse-network-token', allStatsApi: 'https://stats-fuse-mainnet.k8s-prod-1.blockscout.com' },
  [CHAIN.POLYGON]: { explorer: 'https://polygon.blockscout.com', CGToken: 'matic-network', allStatsApi: 'https://stats-polygon-mainnet.k8s-prod-3.blockscout.com' },
  [CHAIN.MINT]: { explorer: 'https://explorer.mintchain.io', CGToken: 'ethereum', allStatsApi: 'https://explorer-mint-mainnet-0.t.conduit.xyz' },
  [CHAIN.OAS]: { explorer: 'https://explorer.oasys.games', CGToken: 'oasys' },
  [CHAIN.KROMA]: { explorer: 'https://blockscout.kroma.network', CGToken: 'ethereum', allStatsApi: 'https://blockscout.kroma.network' },
  [CHAIN.METIS]: { explorer: 'https://andromeda-explorer.metis.io', CGToken: 'metis-token' },
  [CHAIN.BLAST]: { explorer: 'https://blast.blockscout.com', CGToken: 'ethereum', allStatsApi: 'https://stats-blast-mainnet.k8s-prod-1.blockscout.com' },
  [CHAIN.MANTLE]: { explorer: 'https://explorer.mantle.xyz', CGToken: 'mantle', allStatsApi: 'https://mantle-blockscout-stats.mantle.xyz' },
  [CHAIN.MODE]: { explorer: 'https://explorer.mode.network', CGToken: 'ethereum', allStatsApi: 'https://explorer-mode-mainnet-0.t.conduit.xyz', },
  [CHAIN.SCROLL]: { explorer: 'https://scroll.blockscout.com', CGToken: 'ethereum' },
  [CHAIN.SEI]: { explorer: 'https://sei.blockscout.com', CGToken: 'sei-network' },
  [CHAIN.UNICHAIN]: { explorer: 'https://unichain.blockscout.com', CGToken: 'ethereum', allStatsApi: 'https://stats-uniswap-mainnet.k8s-prod-2.blockscout.com' },
  [CHAIN.LISK]: { explorer: 'https://blockscout.lisk.com', CGToken: 'ethereum', allStatsApi: 'https://stats-lisk-mainnet.k8s.blockscout.com' },
  [CHAIN.STORY]: { explorer: 'https://www.storyscan.io', CGToken: 'story-2', allStatsApi: 'https://stats-story-mainnet.k8s-prod-3.blockscout.com', },
  [CHAIN.APECHAIN]: { explorer: 'https://apechain.calderaexplorer.xyz', CGToken: 'apecoin' },
  [CHAIN.HEMI]: { explorer: 'https://explorer.hemi.xyz', CGToken: 'ethereum', allStatsApi: 'https://explorer.hemi.xyz' },
  [CHAIN.HARMONY]: { explorer: 'https://explorer.harmony.one', CGToken: 'harmony' },
  [CHAIN.KCC]: { explorer: 'https://scan.kcc.io', CGToken: 'kucoin-shares' },
  [CHAIN.THUNDERCORE]: { explorer: 'https://explorer-mainnet.thundercore.com', CGToken: 'thunder-token' }, 
  [CHAIN.CHILIZ]: { explorer: 'https://scan.chiliz.com', CGToken: 'chiliz' },
  [CHAIN.SUPERPOSITION]: { explorer: 'https://explorer.superposition.so', CGToken: 'ethereum', allStatsApi: 'https://explorer-superposition-1v9rjalnat.t.conduit.xyz', },
  [CHAIN.BOB]: { explorer: 'https://explorer.gobob.xyz', CGToken: 'ethereum', allStatsApi: 'https://explorer-bob-mainnet-0.t.conduit.xyz' },
  [CHAIN.REYA]: { explorer: 'https://explorer.reya.network', CGToken: 'ethereum', allStatsApi: 'https://stats-reya-mainnet.k8s-prod-3.blockscout.com' },
  [CHAIN.SWELLCHAIN]: { explorer: 'https://explorer.swellnetwork.io/', CGToken: 'ethereum', allStatsApi: 'https://explorer.swellnetwork.io' },
  [CHAIN.ZORA]: { explorer: 'https://explorer.zora.co', CGToken: 'ethereum', allStatsApi: 'https://explorer.zora.co' },
  [CHAIN.WC]: { explorer: 'https://worldchain-mainnet.explorer.alchemy.com', CGToken: 'ethereum', allStatsApi: 'https://stats-alchemy-worldchain-mainnet.k8s.blockscout.com' },
  [CHAIN.ANCIENT8]: { explorer: 'https://scan.ancient8.gg', CGToken: 'ethereum', allStatsApi: 'https://explorer-ancient8-mainnet-0.t.conduit.xyz' },

  [CHAIN.GRAVITY]: { explorer: 'https://explorer.gravity.xyz', CGToken: 'g-token', allStatsApi: 'https://explorer-gravity-mainnet-0.t.conduit.xyz' },
  [CHAIN.CORN]: { explorer: 'https://maizenet-explorer.usecorn.com', CGToken: 'wrapped-bitcoin', allStatsApi: 'https://explorer-corn-maizenet.t.conduit.xyz' },
  [CHAIN.LIGHTLINK_PHOENIX]: { explorer: 'https://phoenix.lightlink.io', CGToken: 'lightlink', allStatsApi: 'https://stats-lightlink-phoenix.k8s.blockscout.com' },
  [CHAIN.IOTAEVM]: { CGToken: 'iota', explorer: 'https://explorer.evm.iota.org', allStatsApi: 'https://stats-iota-evm.k8s.blockscout.com' },
  [CHAIN.FILECOIN]: { CGToken: 'filecoin', explorer: 'https://filecoin.blockscout.com/', allStatsApi: 'https://stats-filecoin.k8s-prod-1.blockscout.com' },
  [CHAIN.HASHKEY]: { CGToken: 'hashkey-ecopoints', explorer: 'https://hashkey.blockscout.com', allStatsApi: 'https://stats-hashkey-mainnet.k8s.blockscout.com', start: '2025-03-09' },
  [CHAIN.KARAK]: { CGToken: 'ethereum', explorer: 'https://explorer.karak.network' },
  [CHAIN.WINR]: { CGToken: 'winr-protocol', explorer: 'https://explorer.winr.games' },
  [CHAIN.SOMNIA]: { CGToken: 'somnia', explorer: 'https://explorer.somnia.network', start: '2025-07-01', },
  [CHAIN.GOAT]: { CGToken: 'bitcoin', explorer: 'https://explorer.goat.network', start: '2024-12-22', },
  [CHAIN.ASTAR]: { CGToken: 'astar', explorer: 'https://astar.blockscout.com/', start:'2021-12-18'},
  [CHAIN.PLUME]: { CGToken: 'plume', explorer: 'https://explorer.plume.org', start:'2025-02-20'},
  [CHAIN.SX_NETWORK]: { CGToken: 'sx-network-2', explorer: 'https://explorerl2.sx.technology/', start:'2024-12-05'},
  [CHAIN.ALEPH_ZERO_EVM]: { CGToken: 'aleph-zero', explorer: "https://evm-explorer.alephzero.org", start: '2024-07-30' },  
  [CHAIN.XRPL_EVM]: { CGToken: 'ripple', explorer: 'https://explorer.xrplevm.org' },
  [CHAIN.APPCHAIN]: { CGToken: 'ethereum', explorer: "https://explorer.appchain.xyz/", start: '2024-11-08' },
}

function getTimeString(timestamp: number) {
  return new Date(timestamp * 1000).toISOString().slice(0, '2011-10-05'.length)
}

async function sleep(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time))
}

export function blockscoutFeeAdapter2(chain: string) {
  let config = chainConfigMap[chain]
  if (!config) throw new Error(`No blockscout config for chain ${chain}`)
  let { url, CGToken, explorer, start, allStatsApi, requestConfig } = config
  if (explorer && explorer.endsWith('/')) explorer = explorer.slice(0, -1)
  if (!url && explorer) url = `${explorer}/api?module=stats&action=totalfees`
  const adapter: Adapter = {
    version: 1,
    adapter: {
      [chain]: {
        fetch: async (_timestamp: number, _: ChainBlocks, { chain, createBalances, startOfDay, }: FetchOptions) => {

          const dateString = getTimeString(startOfDay)
          let todayData = undefined
          let todayPrice = undefined



          if (getEnv('BLOCKSCOUT_BULK_MODE')) {
            if (allStatsApi && !gasData[chain]) {
              console.log('pulling chain data for', chain)
              const { chart } = await httpGet(`${allStatsApi}/api/v1/lines/txnsFee?resolution=DAY`, requestConfig)
              gasData[chain] = {}
              for (const { date, value } of chart) {
                gasData[chain][date] = +value
              }

            }


            if (CGToken && !bulkStoreCGData[CGToken] && !attemptedToPullCGTokenPrice[CGToken]) {
              attemptedToPullCGTokenPrice[CGToken] = true
              console.log('pulling CG data for', CGToken)
              const { prices } = await httpGet(`https://pro-api.coingecko.com/api/v3/coins/${CGToken}/market_chart?vs_currency=usd&days=max&interval=daily`, {
                headers: {
                  'x-cg-pro-api-key': getEnv('CG_KEY'),
                }
              })
              bulkStoreCGData[CGToken] = {}
              for (const [date, value] of prices) {
                bulkStoreCGData[CGToken][getTimeString(date / 1000)] = +value
              }
            }

            todayData = gasData[chain]?.[dateString]
            todayPrice = bulkStoreCGData[CGToken][dateString]
            if (todayData === undefined) {
              const fees = await httpGet(`${url}&date=${dateString}`, requestConfig)
              todayData = fees.result / 1e18
            }

            if (todayPrice === undefined || todayData === undefined) {
              console.log({ chain, todayPrice, todayData, dateString })
              throw new Error('Issue fetching data')

            }

            return { timestamp: startOfDay, dailyFees: todayPrice * todayData }
          }




          const dailyFees = createBalances()

          const fees = await httpGet(`${url}&date=${dateString}`, requestConfig)
          
          if (
            chain === CHAIN.THORCHAIN &&
            (!fees || fees.result === undefined || fees.result === null)
          ) {
            console.log(chain, ' Blockscout API not available, runescan.io may not support this endpoint')
            return {
              timestamp: startOfDay,
              dailyFees: createBalances(),
            }
          }
          
          if (!fees || fees.result === undefined || fees.result === null) {
            console.log(chain, ' Error fetching fees', fees)
            throw new Error('Error fetching fees')
          }
          
          if (chain == CHAIN.CANTO && CGToken)
            dailyFees.addCGToken(CGToken, fees.gas_used_today * fees.gas_prices.average / 1e18)
          else if (CGToken)
            dailyFees.addCGToken(CGToken, fees.result / 1e18)
          else
            dailyFees.addGasToken(fees.result)
          
          if (chain == CHAIN.SOMNIA) {
            const dailyRevenue = dailyFees.clone(0.5);
            return {
              timestamp: startOfDay,
              dailyFees,
              dailyRevenue,
              dailyHoldersRevenue: dailyRevenue
            }
          }
          
          return {
            timestamp: startOfDay,
            dailyFees,
          };
          
        },
        start,
      },
    },
    protocolType: ProtocolType.CHAIN
  }

  return adapter
}

const attemptedToPullCGTokenPrice: any = {}


export const bulkStoreCGData: any = {}
export const gasData: any = {}

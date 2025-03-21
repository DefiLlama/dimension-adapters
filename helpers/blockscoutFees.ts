import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { httpGet } from '../utils/fetchURL';
import { CHAIN } from "./chains";

const chainConfigMap: any = {
  [CHAIN.FANTOM]: { explorer: 'https://ftmscout.com', },
  [CHAIN.CELO]: { explorer: 'https://celo.blockscout.com', },
  [CHAIN.AURORA]: { explorer: 'https://aurorascan.dev', },
  [CHAIN.XDAI]: { explorer: 'https://blockscout.com/xdai/mainnet', },
  [CHAIN.CANTO]: { explorer: 'https://explorer.plexnode.wtf', },
  [CHAIN.CRONOS]: { explorer: 'https://cronos.org/explorer', },
  [CHAIN.MIXIN]: { explorer: 'https://scan.mvm.dev', CGToken: 'mixin' },
  [CHAIN.ENERGYWEB]: { explorer: 'https://explorer.energyweb.org', CGToken: 'energy-web-token' },
  [CHAIN.IMX]: { explorer: 'https://explorer.immutable.com', CGToken: 'immutable-x' },
  [CHAIN.ZETA]: { explorer: 'https://zetachain.blockscout.com', CGToken: 'zetachain' },
  [CHAIN.ETHERLINK]: { explorer: 'https://explorer.etherlink.com', CGToken: 'tezos' },
  [CHAIN.REDSTONE]: { explorer: 'https://explorer.redstone.xyz', CGToken: 'ethereum' },
  [CHAIN.SHIMMER_EVM]: { explorer: 'https://explorer.evm.shimmer.network', CGToken: 'shimmer' },
  [CHAIN.FLARE]: { explorer: 'https://flare-explorer.flare.network', CGToken: 'flare-networks' },
  [CHAIN.KARDIA]: { explorer: 'https://explorer.kardiachain.io/', CGToken: 'kardiachain' },
  [CHAIN.ROOTSTOCK]: { explorer: 'https://rootstock.blockscout.com/', CGToken: 'rootstock' },
  [CHAIN.TELOS]: { explorer: 'https://telostx.com/', CGToken: 'telos' },
  // [CHAIN.]: { explorer: 'https://explorer.execution.mainnet.lukso.network/', CGToken: ''},
  [CHAIN.ETHEREUM_CLASSIC]: { explorer: 'https://etc.blockscout.com/' },
  [CHAIN.SYSCOIN]: { explorer: 'https://explorer.syscoin.org/' },
  // [CHAIN.Z]: { explorer: 'https://zyxscan.com', CGToken: ''},
  [CHAIN.VELAS]: { explorer: 'https://evmexplorer.velas.com/', CGToken: 'velas' },
  [CHAIN.NULS]: { explorer: 'https://chains.blockscout.com/evmscan.nuls.io', CGToken: 'nuls' },
  [CHAIN.FUSE]: { explorer: 'https://explorer.fuse.io/', CGToken: 'fuse-network-token' },
  [CHAIN.POLYGON]: { explorer: 'https://polygon.blockscout.com/' },
  // [CHAIN.MANTA]: { explorer: 'https://pacific-explorer.manta.network/', CGToken: 'ethereum' },
  [CHAIN.MINT]: { explorer: 'https://explorer.mintchain.io/', CGToken: 'ethereum' },
  [CHAIN.OAS]: { explorer: 'https://explorer.oasys.games/', CGToken: 'oasys' },
  [CHAIN.KROMA]: { explorer: 'https://blockscout.kroma.network/', CGToken: 'ethereum' },
  // [CHAIN.DER]: { explorer: 'https://explorer.derive.xyz/', CGToken: ''},
  [CHAIN.METIS]: { explorer: 'https://andromeda-explorer.metis.io/', CGToken: 'metis-token' },
  [CHAIN.BLAST]: { explorer: 'https://blast.blockscout.com/', },
  // [CHAIN.LINEA]: { explorer: 'https://explorer.linea.build/', CGToken: 'ethereum' },
  [CHAIN.MANTLE]: { explorer: 'https://explorer.mantle.xyz/', CGToken: 'mantle' },
  [CHAIN.MODE]: { explorer: 'https://explorer.mode.network/', CGToken: 'ethereum' },
  [CHAIN.SCROLL]: { explorer: 'https://scroll.blockscout.com/', CGToken: 'ethereum' },
  [CHAIN.SEI]: { explorer: 'https://sei.blockscout.com/', CGToken: 'sei-network' },
  [CHAIN.UNICHAIN]: { explorer: 'https://unichain.blockscout.com', CGToken: 'ethereum' },
  [CHAIN.LISK]: { explorer: 'https://blockscout.lisk.com/', CGToken: 'ethereum' },
  [CHAIN.STORY]: { explorer: 'https://www.storyscan.io/', CGToken: 'story-2' },
  // [CHAIN.GRAVITY]: { explorer: 'https://explorer.gravity.xyz/', CGToken: 'g-token' },
  [CHAIN.APECHAIN]: { explorer: 'https://apechain.calderaexplorer.xyz/', CGToken: 'apecoin' },
  [CHAIN.HEMI]: { explorer: 'https://explorer.hemi.xyz/', CGToken: 'ethereum' },
  // [CHAIN.ZKFAIR]: { explorer: 'https://scan.zkfair.io', CGToken: 'ethereum' },
  [CHAIN.HARMONY]: { explorer: 'https://explorer.harmony.one', CGToken: 'harmony' },
  [CHAIN.KCC]: { explorer: 'https://scan.kcc.io', CGToken: 'kucoin-shares' },
  [CHAIN.THUNDERCORE]: { explorer: 'https://explorer-mainnet.thundercore.com/', CGToken: 'thunder-token' },
  [CHAIN.CHILIZ]: { explorer: 'https://scan.chiliz.com/', CGToken: 'chiliz' },
}

export function blockscoutFeeAdapter2(chain: string) {
  let config = chainConfigMap[chain]
  if (!config) throw new Error(`No blockscout config for chain ${chain}`)
  let { url, CGToken, explorer, start, } = config
  if (explorer && explorer.endsWith('/')) explorer = explorer.slice(0, -1)
  if (!url && explorer) url = `${explorer}/api?module=stats&action=totalfees`
  const adapter: Adapter = {
    version: 1,
    adapter: {
      [chain]: {
        fetch: async (_timestamp: number, _: ChainBlocks, { chain, createBalances, startOfDay, }: FetchOptions) => {

          const dailyFees = createBalances()
          const date = new Date(startOfDay * 1000).toISOString().slice(0, "2011-10-05".length)
          const fees = await httpGet(`${url}&date=${date}`)
          if (chain == CHAIN.CANTO && CGToken) dailyFees.addCGToken(CGToken, fees.gas_used_today * fees.gas_prices.average / 1e18)
          else if (CGToken) dailyFees.addCGToken(CGToken, fees.result / 1e18)
          else dailyFees.addGasToken(fees.result)

          return {
            timestamp: startOfDay, dailyFees,
          };
        },
        start,
      },
    },
    protocolType: ProtocolType.CHAIN
  }

  return adapter
}

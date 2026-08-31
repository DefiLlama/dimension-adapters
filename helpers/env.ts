const BOOL_KEYS = [
  'LLAMA_DEBUG_MODE',
]

const DEFAULTS: any = {
  ANKR_API_KEY: '79258ce7f7ee046decc3b5292a24eb4bf7c910d7e39b691384c7ce0cfb839a01',
  SPACESCAN_API_KEY: 'tkn1qqqhsdmkq3pzrcvt24sgpstsndz2z95qsetg4zchsdmkq3p9wqqqdr2u6a', // free-plan key for api.spacescan.io (Chia block lookups)
  ALTHEA_RPC: "https://althea-l1-archive.althea.systems:8545",
  ZETA_RPC: "https://zetachain-evm.blockpi.network/v1/rpc/public,https://zetachain-mainnet-archive.allthatnode.com:8545",
  SOMNIA_ARCHIVAL_RPC: 'https://explorer.somnia.network/api/eth-rpc',
  CAMP_RPC: 'https://rpc-mainnet.campnetwork.xyz',
  ERA_RPC: 'https://mainnet.era.zksync.io,https://zksync.drpc.org,https://1rpc.io/zksync2-era',
  SVM_RPC: "https://rpc.cosvm.net",
  XLAYER_RPC: "https://xlayerrpc.okx.com",
  '0G_ARCHIVAL_RPC': "https://0g.drpc.org,https://16661.rpc.thirdweb.com",
  '0G_RPC': "https://0g.drpc.org,https://16661.rpc.thirdweb.com",
  BITLAYER_RPC: "https://rpc.bitlayer.org,https://rpc.ankr.com/bitlayer,https://rpc.bitlayer-rpc.com,https://rpc-bitlayer.rockx.com",
  PLANQ_RPC: "https://planq-rpc.nodies.app,https://jsonrpc.planq.nodestake.top",
  VELAS_RPC: 'https://evmexplorer.velas.com/rpc', // the /api/eth-rpc proxy stopped serving eth_getBlockByNumber ("Action not found")
  HARMONY_RPC: 'https://explorer.harmony.one/api/eth-rpc',
  SMARTBCH_RPC: 'https://smartscout.cash//api/eth-rpc',
  HYPERLIQUID_RPC: 'https://rpc.purroofgroup.com',
  FUSE_RPC: 'https://explorer.fuse.io/api/eth-rpc',
  SWELLCHAIN_ARCHIVAL_RPC: 'https://explorer.swellnetwork.io/api/eth-rpc',
  PULSECHAIN_ARCHIVAL_RPC: 'https://api.scan.pulsechain.com/api/eth-rpc',
  XRPL_EVM_RPC: 'https://explorer.xrplevm.org/api/eth-rpc',
  MANTLE_ARCHIVAL_RPC: 'https://explorer.mantle.xyz/api/eth-rpc',
  GATELAYER_RPC: 'https://www.gatescan.org/gatelayer/api/eth-rpc',
  BITKUB_RPC: 'https://www.kubscan.com/api/eth-rpc', // official rpc.bitkubchain.io has no historical state (pruned); kubscan blockscout proxy serves archival eth_call + wide eth_getLogs
  BITKUB_ARCHIVAL_RPC: 'https://www.kubscan.com/api/eth-rpc',
  BITKUB_RPC_MULTICALL: '0xcA11bde05977b3631167028862bE2a173976CA11', // canonical multicall3 is deployed on bitkub but sdk registry doesn't list chain 96; without it every balanceOf is an individual eth_call and the RPCs 429
  BITKUB_RPC_MAX_PARALLEL: '3', // both bitkub RPCs rate-limit aggressively (429) under the sdk's default 100 parallel requests
  BITKUB_RPC_GET_LOGS_CONCURRENCY_LIMIT: '3',
  XDC_RPC: 'https://rpc.xdc.network,https://rpc.ankr.com/xdc', // xinfin.network endpoints 403, rpc.xdc.org stale ~2 months, xdcrpc.com load-balances onto stale/rate-limited backends
  XDC_ARCHIVAL_RPC: 'https://rpc.xdc.network', // archival + answers eth_getLogs over 5000 blocks
  SONGBIRD_RPC: 'https://songbird-api.flare.network/ext/C/rpc', // archival state, but caps eth_getLogs at 30 blocks; default first entry sgb.ftso.com.au is broken
  SONGBIRD_ARCHIVAL_RPC: 'https://rpc.au.cc/songbird,https://songbird-explorer.flare.network/api/eth-rpc', // for getLogs: rpc.au.cc handles 5000-block ranges uncapped, blockscout proxy as fallback (caps at 1000 logs)
  ROBINHOOD_RPC: 'https://rpc.mainnet.chain.robinhood.com',
  RISE_ARCHIVAL_RPC: 'https://explorer.risechain.com/api/eth-rpc', // public rpc.risechain.com caps eth_getLogs at 5000 blocks
  RONIN_RPC: 'https://ronin.gateway.tenderly.co,https://gateway.tenderly.co/public/ronin',
  RSK_RPC: 'https://rootstock.blockscout.com/api/eth-rpc', // none of the configured rsk rpcs implement eth_getLogs
  SHIDO_RPC: 'https://shidoscan.net/api/eth-rpc',
  SAGA_RPC: "https://sagaevm.jsonrpc.sagarpc.io",
  SAGA_WHITELISTED_RPC: 'https://sagaevm-archive.jsonrpc.sagarpc.io',
  CANTO_RPC: 'https://canto.gravitychain.io', // tuber.build/api/eth-rpc now 403s; chain halted 2026-08-10 (no blocks since)
  APTOS_RPC: 'https://aptos-mainnet.pontem.network',
  SOLANA_RPC: "https://api.mainnet-beta.solana.com",
  NEAR_RPC: "https://free.rpc.fastnear.com,https://near.lava.build,https://rpc.mainnet.near.org",
  VIRTUS_BACKEND_BASE: 'https://back.virtus-protocol.com/api',
  BLOCKFROST_PROJECT_ID: 'mai'+'nnetBfkdsCOvb4BS'+'VA6pb1D43ptQ7t3cLt06',
  SAUCERSWAP_API_KEY: 'api262369f52fef0cf082bc1a24d89c5',
  HYDRADX_BLOCK_LOW: '7036666',
  DERIVE_API_KEY: '0485a970adfdf963bca' + '126b3ddbc52eb6570aa3' + '5169fa6a2157dd76cbfacd1bb',
  DEBUG_BREAKDOWN_FEES: true,
  SUI_GRAPH_RPC: 'https://graphql.mainnet.sui.io/graphql',
}

export const ENV_KEYS = new Set([
  ...BOOL_KEYS,
  ...Object.keys(DEFAULTS),
  'PANCAKESWAP_OPBNB_SUBGRAPH',
  'INDEXA_DB',
  'DUNE_API_KEYS',
  'DUNE_RESTRICTED_MODE',
  'ALLIUM_API_KEY',
  'BIT_QUERY_API_KEY',
  'SMARDEX_SUBGRAPH_API_KEY',
  'PROD_VYBE_API_KEY',
  'PERENNIAL_V2_SUBGRAPH_API_KEY',
  'LEVANA_API_KEY',
  'ZEROx_API_KEY',
  'ZEROX_API_KEY',
  'AGGREGATOR_0X_API_KEY',
  'SUI_RPC',
  'OKX_API_KEY',
  'ALCHEMIX_KEY',
  'ALCHEMIX_SECRET',
  'STARBASE_API_KEY',
  'ENSO_API_KEY',
  'NUMIA_API_KEY',
  'CAMELOT_API_KEY',
  'TRADERJOE_API_KEY',
  'MULTIVERSX_USERS_API_KEY',
  'BLOCKSCOUT_BULK_MODE',
  'CG_KEY',
  'METAPLEX_API_KEY',
  'DEFIAPP_API_KEY',
  'GATESWAP_DEFILLAMA_API_KEY',
  'SMARDEX_SUBGRAPH_API_KEY',
  'VIRTUS_BACKEND_BASE',
  'DUNE_BULK_MODE',
  'DUNE_BULK_MODE_BATCH_TIME',
  'LLAMA_HL_INDEXER',
  'SAUCERSWAP_API_KEY',
  'VOLO_VAULT_API_KEY',
  'TREADTOOLS_API_KEY',
  'CLICKHOUSE_CONFIG',
  'PROXY_AUTH',
  'DERIVE_API_KEY',
  'DECIBEL_API_KEY',
  'SPACESCOPE_API_KEY',
  'DEEPTRADE_API_KEY',
  'HYPERSWAP_API_KEY',
  'MIRACLETRADE_API_KEY',
  'FRED_API_KEY',
  'SUBSCAN_API_KEY',
  'PEARL_BLOCKBOOK_API',
  'OKLINK_API_KEY',
  'TRONSCAN_API_KEY',
  'ROBINHOOD_RPC',
  'INTERNAL_API_KEY',
  'MARKETS_API'
])

// This is done to support both ZEROx_API_KEY and ZEROX_API_KEY
if (!process.env.ZEROX_API_KEY) process.env.ZEROX_API_KEY = process.env.ZEROx_API_KEY

Object.keys(DEFAULTS).forEach(i => {
  if (!process.env[i]) process.env[i] = DEFAULTS[i] // this is done to set the chain RPC details in @defillama/sdk
})


export function getEnv(key: string): any {
  if (!ENV_KEYS.has(key)) throw new Error(`Unknown env key: ${key}`)
  const value = process.env[key] ?? DEFAULTS[key]
  return BOOL_KEYS.includes(key) ? !!value : value
}

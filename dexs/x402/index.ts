import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { facilitators } from "./facilitators";

interface TransferRow {
  chain: string;
  token: string;
  volume: string;
}

const DUNE_CHAIN_MAP: Record<string, string> = {
  [CHAIN.BASE]: 'base',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.ABSTRACT]: 'abstract',
  [CHAIN.BSC]: 'bnb',
  [CHAIN.AVAX]: 'avalanche_c',
  [CHAIN.HYPERLIQUID]: 'hyperevm',
  [CHAIN.CELO]: 'celo',
  [CHAIN.ARC]: 'arc',
}

function arrayToQuotedString(items: string[]): string {                                                                                                                                                                                                                                                                                                                    
  return items.map(item => `'${item}'`).join(', ');                                                                                                                                                                                                                                                                                                                        
}     

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    select
      blockchain as chain,
      CAST(contract_address as varchar) as token,
      SUM(amount_raw) as volume
    from tokens.transfers t
    where t.tx_from IN ( ${facilitators.EVM} )
    and t."from" != tx_from and t."from" != t."to" and t.blockchain IN (${arrayToQuotedString(Object.values(DUNE_CHAIN_MAP))})
    and TIME_RANGE
    group by blockchain, contract_address
    union all
    select
      'solana' as chain,
      token_mint_address as token,
      SUM(amount) as volume
    from tokens_solana.transfers
    where tx_signer IN ( ${facilitators.solana.map(address => `'${address}'`)} )
    and tx_signer != from_owner and from_owner != to_owner
    and TIME_RANGE
    group by token_mint_address
  `);
};

// Central City Router 4: x402 payments settled through Circle Gateway nanopayments (scheme exact,
// GatewayWalletBatched). Circle settles them in batches inside its GatewayWallet, with no token
// transfer per payment, so the facilitator query above can't see them. Router 4 records every
// settled batch on Base and Arc (one BatchRecorded event per batch part, volume in raw USDC with 6
// decimals); each part's payments can be checked against Circle's Gateway API.
// Spec and live totals: https://centralcity.ai/api/public/router4
const CENTRAL_CITY_ROUTER4: Record<string, string> = {
  [CHAIN.BASE]: '0x6f5a48A353820ab225fE7B301AD77B85D5B1c126',
  [CHAIN.ARC]: '0x6f5a48A353820ab225fE7B301AD77B85D5B1c126',
}
const BATCH_RECORDED = 'event BatchRecorded(uint256 indexed chainId, bytes32 indexed batchTx, uint32 payments, uint64 volume, bytes32 transfersRoot)'

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const chain = DUNE_CHAIN_MAP[options.chain] ? DUNE_CHAIN_MAP[options.chain] : options.chain
  const results = options.preFetchedResults
  const dailyVolume = options.createBalances()
  results.filter((res: TransferRow) => res.chain === chain).forEach((row: TransferRow) => dailyVolume.add(row.token, row.volume))

  const router4 = CENTRAL_CITY_ROUTER4[options.chain]
  if (router4) {
    const parts = await options.getLogs({ target: router4, eventAbi: BATCH_RECORDED })
    parts.forEach((part: any) => dailyVolume.addUSDValue(Number(part.volume) / 1e6))
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch,
  chains: [
    ...Object.keys(DUNE_CHAIN_MAP),
    CHAIN.SOLANA,
  ],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: "2025-05-15",
}

export default adapter
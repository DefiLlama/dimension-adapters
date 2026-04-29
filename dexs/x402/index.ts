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

async function fetch(_: any, _1: any, options: FetchOptions): Promise<FetchResult> {
  const chain = DUNE_CHAIN_MAP[options.chain] ? DUNE_CHAIN_MAP[options.chain] : options.chain
  const results = options.preFetchedResults
  const dailyVolume = options.createBalances()
  results.filter((res: TransferRow) => res.chain === chain).forEach((row: TransferRow) => dailyVolume.add(row.token, row.volume))

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
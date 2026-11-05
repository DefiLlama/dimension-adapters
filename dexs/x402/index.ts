import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { facilitators } from "./facilitators";

interface TransferRow {
  chain: string;
  token: string;
  volume: string;
}

// Central City Router 4: x402 payments settled through Circle Gateway nanopayments (scheme exact,
// GatewayWalletBatched). Circle settles them in batches inside its GatewayWallet, with no token
// transfer per payment, so the facilitator query below can't see them. Router 4 records every
// settled batch on Base and Arc (one BatchRecorded event per batch part, volume in raw USDC with 6
// decimals); each part's payments can be checked against Circle's Gateway API.
// Spec and live totals: https://centralcity.ai/api/public/router4
const CENTRAL_CITY_ROUTER4 = '0x6f5a48A353820ab225fE7B301AD77B85D5B1c126'
const BATCH_RECORDED = 'event BatchRecorded(uint256 indexed chainId, bytes32 indexed batchTx, uint32 payments, uint64 volume, bytes32 transfersRoot)'

// Every supported chain: its Dune name (facilitator transfers), its start, and Central City's Router 4
// where it is deployed.
const chainConfig: Record<string, { duneChain: string, start: string, router4?: string }> = {
  [CHAIN.BASE]: { duneChain: 'base', start: '2025-05-15', router4: CENTRAL_CITY_ROUTER4 },
  [CHAIN.POLYGON]: { duneChain: 'polygon', start: '2025-05-15' },
  [CHAIN.ARBITRUM]: { duneChain: 'arbitrum', start: '2025-05-15' },
  [CHAIN.OPTIMISM]: { duneChain: 'optimism', start: '2025-05-15' },
  [CHAIN.ABSTRACT]: { duneChain: 'abstract', start: '2025-05-15' },
  [CHAIN.BSC]: { duneChain: 'bnb', start: '2025-05-15' },
  [CHAIN.AVAX]: { duneChain: 'avalanche_c', start: '2025-05-15' },
  [CHAIN.HYPERLIQUID]: { duneChain: 'hyperevm', start: '2025-05-15' },
  [CHAIN.CELO]: { duneChain: 'celo', start: '2025-05-15' },
  [CHAIN.ARC]: { duneChain: 'arc', start: '2025-05-15', router4: CENTRAL_CITY_ROUTER4 },
  [CHAIN.SOLANA]: { duneChain: 'solana', start: '2025-05-15' },
}

/** The Dune names of the EVM chains, for the facilitator transfer query. */
const EVM_DUNE_CHAINS = Object.entries(chainConfig)
  .filter(([chain]) => chain !== CHAIN.SOLANA)
  .map(([, { duneChain }]) => duneChain)

function arrayToQuotedString(items: string[]): string {                                                                                                                                                                                                                                                                                                                    
  return items.map(item => `'${item}'`).join(', ');                                                                                                                                                                                                                                                                                                                        
}     

/**
 * One Dune query for the day: token volume moved in transactions sent by known x402 facilitators,
 * per EVM chain and token, plus Solana's by transaction signer.
 */
const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    select
      blockchain as chain,
      CAST(contract_address as varchar) as token,
      SUM(amount_raw) as volume
    from tokens.transfers t
    where t.tx_from IN ( ${facilitators.EVM} )
    and t."from" != tx_from and t."from" != t."to" and t.blockchain IN (${arrayToQuotedString(EVM_DUNE_CHAINS)})
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

/**
 * A chain's daily x402 volume: the facilitator transfers from the prefetched Dune rows, plus, where
 * Central City's Router 4 is deployed, the USDC volume of the Gateway batches it recorded that day.
 */
async function fetch(options: FetchOptions): Promise<FetchResult> {
  const { duneChain, router4 } = chainConfig[options.chain]
  const results = options.preFetchedResults
  const dailyVolume = options.createBalances()
  results.filter((res: TransferRow) => res.chain === duneChain).forEach((row: TransferRow) => dailyVolume.add(row.token, row.volume))

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
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
}

export default adapter
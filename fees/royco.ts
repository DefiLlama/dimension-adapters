import { Adapter, FetchOptions, FetchResultV2, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { Balances } from "@defillama/sdk";

/**
 * Royco Protocol
 * 
 * Royco Protocol allows anyone to create a market to incentivize any onchain transaction or series of transactions–we call these markets Incentivized Action Markets (IAMs).
 * In IAMs, Incentive Providers (IPs) offer incentives, like tokens or points, for Action Providers (APs) to perform onchain actions.
 * There are two types of IAMs:
 * - Vault IAM: Incentive Providers offer incentives to deposit into an underlying ERC4626 Vault.
 * - Recipe IAM: Incentive Providers offer incentives to perform any onchain transaction or series of transactions–aka a "recipe".
 * 
 * Fees on Royco
 * 
 * Royco is completely free to use as an Action Provider.
 * Royco charges a 4% fee on all incentives spent by Incentive Providers.
 * Fees are only charged when Action Providers fill the order and the Incentive Provider's desired action has been completed.
 * Royco also charges a small amount of frontend fees.
 */

const methodology = {
  Fees: 'Total incentive/reward amount were committed by Incentive Providers.',
  SupplySideRevenue: 'The amount of incentive/reward goes to Action Providers and Frontend Providers.',
  ProtocolRevenue: 'The amount of incentive/reward goes to Royco Protocol.',
}

// defillama chain => royco subgraph chain
const ChainMaps: { [key: string]: string } = {
  [CHAIN.ETHEREUM]: 'mainnet',
  [CHAIN.ARBITRUM]: 'arbitrum-one',
  [CHAIN.BASE]: 'base',
  [CHAIN.CORN]: 'corn-maizenet',
  [CHAIN.SONIC]: 'sonic',
  [CHAIN.HYPERLIQUID]: 'hyperevm',
}

const roycoSubgraph = {
  projectId: "project_cm07c8u214nt801v1b45zb60i",
  recipe: {
    version: "1.0.26",
  },
}

const getRecipeSubgraphUrl = (defillamaChain: string) => {
  return `https://api.goldsky.com/api/public/${roycoSubgraph.projectId}/subgraphs/royco-recipe-${ChainMaps[defillamaChain]}/${roycoSubgraph.recipe.version}/gn`;
}

interface RecipeEvent {
  offerHash: string;
  fillAmount: string;
  incentiveAmounts: Array<string>;
  incentiveTokens: Array<string>;
  protocolFeeAmounts: Array<string>;
  frontendFeeAmounts: Array<string>;
}

async function querySubgraph(options: FetchOptions, endpoint: string, dailySupplySideRevenue: Balances, dailyProtocolRevenue: Balances) {
  const fromTime = Number(options.fromApi.timestamp)
  const toTime = options.toApi.timestamp ? options.toApi.timestamp : fromTime + 24 * 3600

  const receiptEvents: Array<RecipeEvent> = []

  const querySize = 100
  let startOfferHash = ''
  do {
    const query_ipofferFilleds = gql`
        query get_ipofferFilleds($fromTime: Int, $toTime: Int, $offerHash: String) {
          ipofferFilleds(first: ${querySize}, where: {blockTimestamp_gte: $fromTime, blockTimestamp_lte: $toTime, offerHash_gt: $offerHash}) {
            offerHash
            fillAmount
            incentiveAmounts
            protocolFeeAmounts
            frontendFeeAmounts
            transactionHash
          }
        }
      `
    const response = await request(endpoint, query_ipofferFilleds, {
      fromTime,
      toTime,
      offerHash: startOfferHash,
    })

    for (const item of response.ipofferFilleds) {
      const event: RecipeEvent = {
        offerHash: item.offerHash,
        fillAmount: item.fillAmount,
        incentiveAmounts: item.incentiveAmounts,
        protocolFeeAmounts: item.protocolFeeAmounts,
        frontendFeeAmounts: item.frontendFeeAmounts,

        // will fill later
        incentiveTokens: [],
      }

      receiptEvents.push(event)
      startOfferHash = event.offerHash
    }

    if (response.ipofferFilleds.length === 0) {
      // break loop
      startOfferHash = ''
    }
  } while (startOfferHash !== '')

  if (receiptEvents.length === 0) {
    return;
  }

  // query marketId of given offerHash
  const offerHashList: Array<string> = receiptEvents.map(item => item.offerHash)
  const query_ipofferCreateds = gql`
      query get_ipofferCreateds($offers: [String]) {
        ipofferCreateds(first: ${offerHashList.length}, where: {offerHash_in: $offers}) {
          offerHash
          marketHash
        }
      }
    `
  const query_ipofferCreatedsResponse = await request(endpoint, query_ipofferCreateds, {
    offers: offerHashList,
  })

  // query incentive tokens of given marketId
  const query_rawMarkets = gql`
      query get_rawMarkets($markets: [String]) {
        rawMarkets(first: ${offerHashList.length}, where: {marketId_in: $markets}) {
          marketId
          incentivesOfferedIds
        }
      }
    `
  const query_rawMarketsResponse = await request(endpoint, query_rawMarkets, {
    markets: query_ipofferCreatedsResponse.ipofferCreateds.map((item: any) => item.marketHash),
  })

  // map offer offerHash -> raw market id
  const offerHashToIncentiveTokens: { [key: string]: Array<string> } = {}
  for (const offer of query_ipofferCreatedsResponse.ipofferCreateds) {
    const rawMarket = query_rawMarketsResponse.rawMarkets.find((item: any) => item.marketId === offer.marketHash)
    if (rawMarket) {
      // parse incentive tokens from format of: chain-address
      // 1-0x6243558a24cc6116abe751f27e6d7ede50abfc76
      offerHashToIncentiveTokens[offer.offerHash] = rawMarket.incentivesOfferedIds.map((token: string) => token.split('-')[1])
    }
  }

  // update event incentive tokens
  for (let i = 0; i < receiptEvents.length; i++) {
    receiptEvents[i].incentiveTokens = offerHashToIncentiveTokens[receiptEvents[i].offerHash]
  }

  for (const event of receiptEvents) {
    for (let i = 0; i < event.incentiveTokens.length; i++) {
      // add incentive amount + frontend fees to supply side
      dailySupplySideRevenue.add(event.incentiveTokens[i], event.incentiveAmounts[i])
      dailySupplySideRevenue.add(event.incentiveTokens[i], event.frontendFeeAmounts[i])

      // add protocol fees to Royco protocol
      dailyProtocolRevenue.add(event.incentiveTokens[i], event.protocolFeeAmounts[i])
    }
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const recipeSubgraphUrl = getRecipeSubgraphUrl(options.chain)

  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  await querySubgraph(options, recipeSubgraphUrl, dailySupplySideRevenue, dailyProtocolRevenue)

  const dailyFees = options.createBalances()
  dailyFees.addBalances(dailySupplySideRevenue)
  dailyFees.addBalances(dailyProtocolRevenue)

  return {
    dailyFees,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailySupplySideRevenue: dailySupplySideRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2024-12-2', },
    [CHAIN.ARBITRUM]: { start: '2024-11-24', },
    [CHAIN.BASE]: { start: '2024-12-23', },
    [CHAIN.CORN]: { start: '2024-12-2', },
    [CHAIN.SONIC]: { start: '2025-01-15', },
    [CHAIN.HYPERLIQUID]: { start: '2024-12-2', },
  }
}

export default adapter

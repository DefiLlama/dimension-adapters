import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";
import * as sdk from "@defillama/sdk";

const fetch = async (options: FetchOptions): Promise<any> => {
  const dayID = Math.floor(options.startOfDay / 86400);
  const query = `
    {
        algebraDayData(id:${dayID}) {
            id
            volumeUSD
            feesUSD
        }
    }`;
  const url = sdk.graph.modifyEndpoint('LgiKJnsTspbsPBLqDPqULPtnAdSZP6LfPCSo3GWuJ5a');
  const req = await request(url, query);

  // 15% treasury, 1.5% Algebra infra, 83.5% veSTELLA voters.
  const COMMUNITY_FEE = 0.22       // protocol vault share of total swap fees
  const LP_SHARE = 1 - COMMUNITY_FEE
  const TREASURY = 0.15            // of the community vault
  const ALGEBRA = 0.015            // of the community vault (infra licence)
  const VESTELLA = 0.835           // of the community vault

  const feesUSD = Number(req.algebraDayData?.feesUSD ?? 0)
  const protocolRevenue = feesUSD * COMMUNITY_FEE * TREASURY
  const holdersRevenue = feesUSD * COMMUNITY_FEE * VESTELLA
  return {
    dailyVolume: Number(req.algebraDayData?.volumeUSD ?? 0),
    dailyFees: feesUSD,
    dailySupplySideRevenue: feesUSD * (LP_SHARE + COMMUNITY_FEE * ALGEBRA),
    dailyRevenue: protocolRevenue + holdersRevenue,
    dailyProtocolRevenue: protocolRevenue,
    dailyHoldersRevenue: holdersRevenue,
  }
}

const methodology = {
  Fees: 'All trading fees paid by users.',
  SupplySideRevenue: '78% of swap fees retained by liquidity providers in-pool, plus the 1.5% Algebra infrastructure cut of the 22% community vault (~0.33% of total fees), totalling ~78.33% of total fees.',
  Revenue: 'The 22% protocol community vault, minus the Algebra infra cut: ~21.67% of total fees (15% treasury + 83.5% veSTELLA of the 22% vault).',
  ProtocolRevenue: '15% of the 22% community vault to treasury (~3.3% of total fees).',
  HoldersRevenue: '83.5% of the 22% community vault to veSTELLA voters (~18.37% of total fees).',
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.MOONBEAM],
  start: '2025-02-07',
  methodology,
}

export default adapter;

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getSolanaReceived } from "../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  if (options.chain === CHAIN.POLYGON) {
    const dailyFees = await addTokensReceived({
      options,
      targets: ['0xcbc57e7899126f3ad47268a6505231d82b8733c8'],
      tokens: ['0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
    });
    return {
      dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
      dailyHoldersRevenue: options.createBalances(),
    };
  }
  if (options.chain === CHAIN.SOLANA) {
    const dailyHoldersRevenue = await getSolanaReceived({
      options,
      targets: ['Frkgxkt2SPo2eZB2NmY6tjibJHm1VMpGWEC4wc3aAgJx'],
      mints: ['J27UYHX5oeaG1YbUGQc8BmJySXDjNWChdGB2Pi2TMDAq']
    });
    return {
      dailyFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailyHoldersRevenue,
    }
  } else {
    return { dailyFees: options.createBalances() }
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON, CHAIN.SOLANA],
  start: '2025-06-28',
  methodology: {
    Fees: "fees paid by users on the Polycule platform.",
    Revenue: "fees going to the Polycule protocol.",
    ProtocolRevenue: "fees going to the Polycule protocol.",
    HoldersRevenue: "token buybacks from the revenue.",
  },
}

export default adapter;
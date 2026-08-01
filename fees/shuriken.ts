import { Dependencies, FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const FEE_WALLETS = [
  '9cSuF94JWPb1HQzWMcifJzkoggwAtfjsojcUqny5XuJy',
  'shuvodtwMMFFB6KmqCDYaiAe1hRokCVwr4LkT1pLAL5',
  'shrknHaCuVXmahvxLER4Qm9vooBzhbYsMP7HnAAS9Hn',
]

const fetch = async (): Promise<FetchResultFees> => {
  return {} // stop using indexa db
}

const fetchSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: FEE_WALLETS,
    blacklists: FEE_WALLETS,
    blacklist_signers: FEE_WALLETS,
  })

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch as any,
      start: '2023-10-13',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2024-01-14',
    },
  },
  methodology: {
    Fees: "Trading fees paid by users trading through the Shuriken bot (1% per swap, 0.9% via a referral link), collected in SOL by Shuriken's on-chain fee wallets.",
    Revenue: "Collected fees are swept in full from the fee wallets to Shuriken's treasury and retained by the protocol.",
    ProtocolRevenue: "All collected fees are retained by the Shuriken treasury.",
  }
};

export default adapter;

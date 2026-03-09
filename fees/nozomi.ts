import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { getSolanaReceived } from "../helpers/token"
import { METRIC } from "../helpers/metrics"

// https://use.temporal.xyz/nozomi/tipping-and-faq
export const TipPaymentAddresses = [
  "TEMPaMeCRFAS9EKF53Jd6KpHxgL47uWLcpFArU1Fanq",
  "noz3jAjPiHuBPqiSPkkugaJDkJscPuRhYnSpbi8UvC4",
  "noz3str9KXfpKknefHji8L1mPgimezaiUyCHYMDv1GE",
  "noz6uoYCDijhu1V7cutCpwxNiSovEwLdRHPwmgCGDNo",
  "noz9EPNcT7WH6Sou3sr3GGjHQYVkN3DNirpbvDkv9YJ",
  "nozc5yT15LazbLTFVZzoNZCwjh3yUtW86LoUyqsBu4L",
  "nozFrhfnNGoyqwVuwPAW4aaGqempx4PU6g6D9CJMv7Z",
  "nozievPk7HyK1Rqy1MPJwVQ7qQg2QoJGyP71oeDwbsu",
  "noznbgwYnBLDHu8wcQVCEw6kDrXkPdKkydGJGNXGvL7",
  "nozNVWs5N8mgzuD3qigrCG2UoKxZttxzZ85pvAQVrbP",
  "nozpEGbwx4BcGp6pvEdAh1JoC2CQGZdU6HbNP1v2p6P",
  "nozrhjhkCr3zXT3BiT4WCodYCUFeQvcdUkM7MqhKqge",
  "nozrwQtWhEdrA6W8dkbt9gnUaMs52PdAv5byipnadq3",
  "nozUacTVWub3cL4mJmGCYjKZTnE9RbdY5AP46iQgbPJ",
  "nozWCyTPppJjRuw2fpzDhhWbW355fzosWSzrrMYB1Qk",
  "nozWNju6dY353eMkMqURqwQEoM3SFgEKC6psLCSfUne",
  "nozxNBgWohjR75vdspfxR5H9ceC7XXH99xpxhVGt3Bb",
]

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const receivedBalances = await getSolanaReceived({ options, targets: TipPaymentAddresses })
  
  // These tips compensate the Jito tip and pay validators for staked connections.
  // If Jito validates the transaction, the tip goes to the Jito validator. In that case, Nozomi forwards the entire tip to Jito.
  const dailyFees = options.createBalances()
  dailyFees.addBalances(receivedBalances, METRIC.MEV_REWARDS)
  
  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
    dailyRevenue: 0,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-11-01',
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'MEV/tips paid by users/searchers.',
    Revenue: 'Nozomi gets No revenue.',
    SupplySideRevenue: 'All fees used to compensate Jito tips and pay Jito validators.',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.MEV_REWARDS]: 'MEV/tips paid by users/searchers.',
    },
    SupplySideRevenue: {
      [METRIC.MEV_REWARDS]: 'All fees used to compensate Jito tips and pay Jito validators.',
    },
  },
}

export default adapter

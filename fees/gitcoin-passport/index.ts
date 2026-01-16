import * as sdk from "@defillama/sdk"
import { SimpleAdapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

const VERIFIER_CONTRACTS: Record<string, string> = {
  [CHAIN.ARBITRUM]: "0xc4858e4D177Bf0d14571F91401492d62aa608047",
  [CHAIN.OPTIMISM]: "0xa8eD4d2C3f6f98A55cdDEd97C5aE9B932B0633A4",
  [CHAIN.BASE]: "0x16db23c4b99bbC9A6Bf55dF7a787C9AEFD261185",
  [CHAIN.LINEA]: "0xc94aBf0292Ac04AAC18C251d9C8169a8dd2BBbDC",
  [CHAIN.SCROLL]: "0x16db23c4b99bbC9A6Bf55dF7a787C9AEFD261185",
  [CHAIN.ERA]: "0xfCC2d308FD4De098D08f056c424C969d728912bF",
}

const fetchFees = async (options: FetchOptions) => {
  const verifier = VERIFIER_CONTRACTS[options.chain]
  const dailyFees = options.createBalances()

  const endBalance = await sdk.api.eth.getBalance({
    chain: options.chain,
    target: verifier,
    block: Number(options.toApi.block),
  })

  const startBalance = await sdk.api.eth.getBalance({
    chain: options.chain,
    target: verifier,
    block: Number(options.fromApi.block),
  })

  dailyFees.addGasToken(BigInt(endBalance.output) - BigInt(startBalance.output))

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: '2024-05-23',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees,
      start: '2023-08-21',
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-07-21',
    },
    [CHAIN.LINEA]: {
      fetch: fetchFees,
      start: '2023-10-16',
    },
    [CHAIN.SCROLL]: {
      fetch: fetchFees,
      start: '2024-06-21',
    },
    [CHAIN.ERA]: {
      fetch: fetchFees,
      start: '2024-06-06',
    },
  },
  methodology: {
    Fees: "Verification fees (~$2 USD in native ETH per attestation) paid when users call verifyAndAttest on GitcoinVerifier contracts to bring Gitcoin Passport data onchain",
    Revenue: "All verification fees collected by the Gitcoin protocol",
    ProtocolRevenue: "All verification fees collected by the Gitcoin protocol",
  }
}

export default adapter
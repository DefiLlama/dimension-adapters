import { SimpleAdapter, FetchOptions, Dependencies } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { getETHReceived } from "../../helpers/token"

const VERIFIER_CONTRACTS: Record<string, string[]> = {
  [CHAIN.ARBITRUM]: ["0xc4858e4D177Bf0d14571F91401492d62aa608047", "0x62E6BE350d7b7116936EeD5DeB7951ed3AAfC3c4"],
  [CHAIN.OPTIMISM]: ["0xa8eD4d2C3f6f98A55cdDEd97C5aE9B932B0633A4", "0x5e3fDCbCEB58104E8547D5810EB2ED0Fb42eADf4"],
  [CHAIN.BASE]: ["0x16db23c4b99bbC9A6Bf55dF7a787C9AEFD261185", "0x45fa2e93d79fc44d44b697a94330031b8ccbf68e"],
  [CHAIN.LINEA]: ["0xc94aBf0292Ac04AAC18C251d9C8169a8dd2BBbDC", "0xEd551a95f76E96D60e6fE2bD2D845C3b4A6F8cA8"],
  [CHAIN.SCROLL]: ["0x16db23c4b99bbC9A6Bf55dF7a787C9AEFD261185", "0x0EDEBAEaE920a6BFCFe7115566ceF5120ED2ff4C"],
  [CHAIN.ERA]: ["0xfCC2d308FD4De098D08f056c424C969d728912bF", "0xcC3eab33A77135A09770AcAF7D911E5FEf6622F2"],
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const verifiers = VERIFIER_CONTRACTS[options.chain]
  
  const dailyFees = await getETHReceived({
    options,
    targets: verifiers,
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2024-05-23',
    },
    [CHAIN.OPTIMISM]: {
      start: '2023-08-21',
    },
    [CHAIN.BASE]: {
      start: '2024-07-21',
    },
    [CHAIN.LINEA]: {
      start: '2023-10-16',
    },
    [CHAIN.SCROLL]: {
      start: '2024-06-21',
    },
    [CHAIN.ERA]: {
      start: '2024-06-06',
    },
  },
  methodology: {
    Fees: "Verification fees (~$2 USD in native ETH per attestation) paid when users call verifyAndAttest on GitcoinVerifier contracts to bring Gitcoin Passport data onchain",
    Revenue: "All verification fees collected by the Gitcoin protocol",
    ProtocolRevenue: "All verification fees collected by the Gitcoin protocol",
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
}

export default adapter
import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Minterest: Compound-style markets with their own ABI, so it does not fit factory/compoundV2.ts. MToken emits AccrueInterest with an
// extra totalProtocolInterest field and names its reserve factor protocolInterestFactorMantissa:
// https://etherscan.io/address/0x3a5b0ec108f5f28bc5670d95730618ab2c926b90#code
// Flash loan fees are not tracked. No protocol/holders split: how protocol interest is distributed is not documented.
const ABI = {
  getAllMarkets: 'address[]:getAllMarkets',
  underlying: 'address:underlying',
  reserveFactor: 'uint256:protocolInterestFactorMantissa',
  accrueInterest: 'event AccrueInterest(uint256 cashPrior, uint256 interestAccumulated, uint256 borrowIndex, uint256 totalBorrows, uint256 totalProtocolInterest)',
}

const LABEL = {
  toProtocol: 'Borrow Interest To Protocol',
  toLenders: 'Borrow Interest To Lenders',
}

// Supervisor (comptroller) per chain, from the minterest TVL adapter (DefiLlama-Adapters registries/compound.js)
const chainConfig: Record<string, { comptroller: string }> = {
  [CHAIN.ETHEREUM]: { comptroller: "0xD13f50274a68ABF2384C79248ADc259b3777c081" },
  [CHAIN.MANTLE]: { comptroller: "0xe53a90EFd263363993A3B41Aa29f7DaBde1a932D" },
  [CHAIN.TAIKO]: { comptroller: "0xe56c0d4d6A08C05ec42E923EFd06497F115D4799" },
  [CHAIN.MORPH]: { comptroller: "0x121D54E653a63D90569813E7c6a4C5E6084ff7DE" },
}

const fetch = async (options: FetchOptions) => {
  const { comptroller } = chainConfig[options.chain]
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const markets: string[] = await options.api.call({ target: comptroller, abi: ABI.getAllMarkets })
  // markets on the chain's gas token have no underlying
  const underlyings = await options.api.multiCall({ calls: markets, abi: ABI.underlying, permitFailure: true })
  // governance-set and rarely changed, read at the window end
  const reserveFactors = await options.api.multiCall({ calls: markets, abi: ABI.reserveFactor })
  const marketLogs = await options.getLogs({ targets: markets, eventAbi: ABI.accrueInterest, flatten: false })

  marketLogs.forEach((logs: any[], i: number) => {
    const token = underlyings[i] ?? ADDRESSES.null
    const reserveFactor = BigInt(reserveFactors[i]) // 1e18 = 100%
    logs.forEach((log: any) => {
      const interest = BigInt(log.interestAccumulated)
      const toProtocol = interest * reserveFactor / BigInt(1e18)
      dailyFees.add(token, interest, METRIC.BORROW_INTEREST)
      dailyRevenue.add(token, toProtocol, LABEL.toProtocol)
      dailySupplySideRevenue.add(token, interest - toProtocol, LABEL.toLenders)
    })
  })

  return { dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: Object.keys(chainConfig),
  methodology: {
    Fees: "Interest paid by borrowers on Minterest lending markets.",
    Revenue: "The share of borrow interest each Minterest market sets aside as protocol reserves.",
    SupplySideRevenue: "Borrow interest paid to lenders after the protocol's reserve share.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.BORROW_INTEREST]: "Interest accrued on every market, from the interest event each market emits." },
    Revenue: { [LABEL.toProtocol]: "Each market's reserve share of the interest it accrued." },
    SupplySideRevenue: { [LABEL.toLenders]: "Interest left to lenders after each market's reserve share." },
  },
}

export default adapter

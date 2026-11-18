import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Unitus (formerly dForce lending): Compound-style markets with their own ABI, so it does not fit factory/compoundV2.ts. iTokens are
// listed through getAlliTokens, emit UpdateInterest and name their reserve factor reserveRatio:
// https://etherscan.io/address/0x792254876bdd3eae31bd56a6dc71fa18f778bcf9#code
// No protocol/holders split: how reserves are distributed is not documented.
const ABI = {
  getAllMarkets: 'address[]:getAlliTokens',
  underlying: 'address:underlying',
  reserveFactor: 'uint256:reserveRatio',
  accrueInterest: 'event UpdateInterest(uint256 currentBlockNumber, uint256 interestAccumulated, uint256 borrowIndex, uint256 cash, uint256 totalBorrows, uint256 totalReserves)',
}

const LABEL = {
  toProtocol: 'Borrow Interest To Protocol',
  toLenders: 'Borrow Interest To Lenders',
}

// Controller per chain, from the unitus TVL adapter (DefiLlama-Adapters registries/compound.js)
const chainConfig: Record<string, { comptroller: string }> = {
  [CHAIN.ETHEREUM]: { comptroller: "0x8B53Ab2c0Df3230EA327017C91Eb909f815Ad113" },
  [CHAIN.BSC]: { comptroller: "0x0b53E608bD058Bb54748C35148484fD627E6dc0A" },
  [CHAIN.ARBITRUM]: { comptroller: "0x8E7e9eA9023B81457Ae7E6D2a51b003D421E5408" },
  [CHAIN.OPTIMISM]: { comptroller: "0xA300A84D8970718Dac32f54F61Bd568142d8BCF4" },
  [CHAIN.POLYGON]: { comptroller: "0x52eaCd19E38D501D006D2023C813d7E37F025f37" },
  [CHAIN.CONFLUX]: { comptroller: "0xA377eCF53253275125D0a150aF195186271f6a56" },
  [CHAIN.BASE]: { comptroller: "0xBae8d153331129EB40E390A7Dd485363135fcE22" },
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
    Fees: "Interest paid by borrowers on Unitus lending markets.",
    Revenue: "The share of borrow interest each Unitus market sets aside as protocol reserves.",
    SupplySideRevenue: "Borrow interest paid to lenders after the protocol's reserve share.",
  },
  breakdownMethodology: {
    Fees: { [METRIC.BORROW_INTEREST]: "Interest accrued on every market, from the interest event each market emits." },
    Revenue: { [LABEL.toProtocol]: "Each market's reserve share of the interest it accrued." },
    SupplySideRevenue: { [LABEL.toLenders]: "Interest left to lenders after each market's reserve share." },
  },
}

export default adapter

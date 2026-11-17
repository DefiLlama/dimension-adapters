import { Adapter, FetchV2, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

const INFRARED = "0xb71b3DaEA39012Fb0f2B14D2a9C86da9292fC126"
// iBERA fee receivor: every Sweep compounds `amount` (validator rewards left to iBERA holders) into iBERA and holds back
// `fees` (1 / iBERA.feeDivisorShareholders, 25% now) for shareholders. Those fees are collected into the Infrared
// contract, whose protocol cut shows up below as ProtocolFees in iBERA.
const IBERA_RECEIVOR = "0xf6a4A6aCECd5311327AE3866624486b6179fEF97"
const WBERA = "0x6969696969696969696969696969696969696969"

export default {
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: (async ({ getLogs, createBalances, }) => {
        const dailyFees = createBalances()
        const dailyRevenue = createBalances()
        const dailySupplySideRevenue = createBalances()

        // Scrape for ProtocolFees event from the contract
        const logs = await getLogs({
            target: INFRARED,
            eventAbi: 'event ProtocolFees(address indexed _token, uint256 _amt, uint256 _voterAmt)'
        })

        // Process each event log
        logs.map((e: any) => {
            // _amt represents total protocol fees
            dailyFees.add(e._token, e._amt, METRIC.PROTOCOL_FEES)

            // Protocol revenue is the difference between total fees and voter portion
            const protocolRevenue = BigInt(e._amt) - BigInt(e._voterAmt)
            dailyRevenue.add(e._token, protocolRevenue, METRIC.PROTOCOL_FEES)
        })

        const sweeps = await getLogs({
          target: IBERA_RECEIVOR,
          eventAbi: 'event Sweep(address indexed receiver, uint256 amount, uint256 fees)'
        })
        sweeps.forEach((e: any) => {
          dailyFees.add(WBERA, e.amount, METRIC.STAKING_REWARDS)
          dailySupplySideRevenue.add(WBERA, e.amount, METRIC.STAKING_REWARDS)
        })

        // the part of the collected shareholder fee that Infrared does not keep goes to validator operators
        const operatorRewards = await getLogs({
          target: INFRARED,
          eventAbi: 'event OperatorRewardsDistributed(address indexed _ibera, address indexed _distributor, uint256 _amt)'
        })
        operatorRewards.forEach((e: any) => {
          dailyFees.add(e._ibera, e._amt, METRIC.OPERATORS_FEES)
          dailySupplySideRevenue.add(e._ibera, e._amt, METRIC.OPERATORS_FEES)
        })

        return { dailyFees, dailyRevenue, dailySupplySideRevenue, }
      }) as FetchV2,
      start: '2025-02-02', // Using the same fromBlock as in the TVL indexer
    },
  },
  version: 2,
  pullHourly: true,
  methodology: {
    Fees: "iBERA validator rewards (the part compounded for iBERA holders, the part paid to validator operators and Infrared's cut), plus the protocol fees Infrared takes on iBGT vault harvests. What iBGT vault stakers receive is not counted.",
    Revenue: "Protocol fees taken by Infrared, minus the part sent to voters.",
    SupplySideRevenue: "Validator rewards compounded into iBERA for its holders (75% of iBERA validator rewards) and iBERA rewards paid to validator operators.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Protocol fees from ProtocolFees events: Infrared's cut of iBGT vault harvests and of the iBERA shareholder fee.",
      [METRIC.STAKING_REWARDS]: "Validator rewards compounded into iBERA for its holders (Sweep amount on the iBERA fee receivor).",
      [METRIC.OPERATORS_FEES]: "Part of the iBERA shareholder fee that Infrared passes on to validator operators.",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Protocol fees kept by Infrared, minus the part sent to voters.",
    },
    SupplySideRevenue: {
      [METRIC.STAKING_REWARDS]: "Validator rewards compounded into iBERA for its holders.",
      [METRIC.OPERATORS_FEES]: "iBERA rewards paid to validator operators through the Infrared distributor.",
    },
  },
} as Adapter

import { Adapter, FetchOptions, } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";


type TAddress = {
  [l: string | Chain]: string;
}

// Radiant MiddleFeeDistribution (proxy) on each chain. It collects the protocol's
// platform fees, transfers `operationExpenseRatio` of them to the operationExpenses
// treasury (protocol revenue), then forwards the remainder to MultiFeeDistribution
// for dLP lockers and emits NewTransferAdded with that remaining (post-cut) amount.
const address: TAddress = {
  [CHAIN.ARBITRUM]: '0xE10997B8d5C6e8b660451f61accF4BBA00bc901f',
  [CHAIN.BSC]: '0xcebdff400A23E5Ad1CDeB11AfdD0087d5E9dFed8',
  [CHAIN.ETHEREUM]: '0x28E395a54a64284DBA39652921Cd99924f4e3797',
  [CHAIN.BASE]: '0xC49b4D1e6CbbF4cAEf542f297449696d8B47E411'
}

// operationExpenseRatio = 4000 / RATIO_DIVISOR 10000 = 40%, verified live on the
// MiddleFeeDistribution proxy on every chain (Arbitrum/BSC/Ethereum/Base). So the
// emitted lpUsdValue (post-cut) is the 60% locker share; the protocol keeps 40%.
const OPEX_FRAC = 0.4;

const fetch = async ({ chain, createBalances, getLogs }: FetchOptions) => {
  // lpUsdValue is emitted AFTER the operationExpense cut, so it is the lockers' share.
  const lockerRewards = createBalances()
  const logs = await getLogs({ target: address[chain], eventAbi: 'event NewTransferAdded (address indexed asset, uint256 lpUsdValue)' })
  logs.forEach((log) => lockerRewards.addUSDValue(Number(log.lpUsdValue) / 1e18))

  // lpUsdValue = (1 - OPEX_FRAC) of the platform fee. Gross up to recover the full
  // platform fee and the protocol (operationExpense) cut taken before the event.
  const dailyHoldersRevenue = lockerRewards                                      // forwarded to dLP lockers (60%)
  const dailyProtocolRevenue = lockerRewards.clone(OPEX_FRAC / (1 - OPEX_FRAC))  // operationExpense treasury (40%)
  const dailyFees = createBalances()
  dailyFees.addBalances(dailyHoldersRevenue)
  dailyFees.addBalances(dailyProtocolRevenue)
  const dailyRevenue = dailyFees.clone(1)                                        // whole platform fee is protocol revenue

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue }
}

const methodology = {
  Fees: "Platform fees collected by Radiant (reserve-factor cut of borrow interest) and routed through MiddleFeeDistribution.",
  Revenue: "All platform fees are kept by the protocol (split between the operationExpenses treasury and dLP lockers).",
  ProtocolRevenue: "operationExpenseRatio of platform fees (read on-chain) sent to the Radiant operationExpenses treasury.",
  HoldersRevenue: "Remaining platform fees forwarded to MultiFeeDistribution and distributed to dLP lockers.",
}

const adapter: Adapter = {
  fetch, methodology,
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2023-03-18', },
    [CHAIN.BSC]: { start: '2023-03-26', },
    [CHAIN.ETHEREUM]: { start: '2023-11-01', },
    [CHAIN.BASE]: { start: '2024-06-28', },
  }
}

export default adapter;

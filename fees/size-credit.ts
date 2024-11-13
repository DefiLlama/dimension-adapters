import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SIZE_REGISTRY = '0x'

const SizeV1Addresses = [
  {
    name: 'Size_WETH_USDC',
    Size: '0xC2a429681CAd7C1ce36442fbf7A4a68B11eFF940',
    BorrowAToken: '0x38978038a06a21602a4202dfa66968e7f525bf3e',
  },
  {
    name: 'Size_cbBTC_USDC',
    Size: '0xB21Bbe052F5cE9ae681c59725f0A313765Fd016c',
    BorrowAToken: '0x539cB6BB9bee5aaBdFd98eE3ad36849Ac81a2b07'
  }
]

const abis = {
  SizeRegistry: {
    getMarkets: 'function getMarkets() view returns (address[])',
  },
  Size: {
    feeConfig: "function feeConfig() view returns (uint256 swapFeeAPR,uint256 fragmentationFee,uint256 liquidationRewardPercent,uint256 overdueCollateralProtocolPercent,uint256 collateralProtocolPercent,address feeRecipient)",
    data: "function data() view returns (uint256 nextDebtPositionId,uint256 nextCreditPositionId,address underlyingCollateralToken,address underlyingBorrowToken,address collateralToken,address borrowAToken,address debtToken,address variablePool)",
  },
  ERC20: {
    Transfer: "event Transfer(address indexed from,address indexed to,uint256 value)",
  },
  BorrowATokenV1: {
    TransferUnscaled: "event(address indexed from,address indexed to,uint256 value)"
  }
}

const fetch: any = async ({ createBalances, getLogs, api, }: FetchOptions) => {
  const fees = createBalances()

  const markets = await api.call({ abi: abis.SizeRegistry.getMarkets, target: SIZE_REGISTRY })
  const [datas, feeConfigs] = await Promise.all([
    api.multiCall({ abi: abis.Size.data, calls: markets }),
    api.multiCall({ abi: abis.Size.feeConfig, calls: markets }),
  ])

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i]
    const data = datas[i]
    const feeConfig = feeConfigs[i]

    const collateralToken = data.collateralToken
    const borrowAToken = data.borrowAToken

    const underlyingCollateralToken = data.underlyingCollateralToken
    const underlyingBorrowToken = data.underlyingBorrowToken

    const FEE_MAPPING = [
      underlyingCollateralToken,
      underlyingBorrowToken,
    ]

    const getLogsArray = [
      getLogs({
        target: collateralToken,
        eventAbi: abis.ERC20.Transfer,
      }),
      getLogs({
        target: borrowAToken,
        eventAbi: abis.ERC20.Transfer,
      }),
    ]

    const v1Markets = SizeV1Addresses.map((v1) => v1.Size.toLowerCase())

    if (v1Markets.includes(market.toLowerCase())) {
      // also track old (v1) events that happened before the migration
      FEE_MAPPING.push(underlyingBorrowToken)
      getLogsArray.push(
        getLogs({
          target: SizeV1Addresses.find((v1) => v1.Size.toLowerCase() === market.toLowerCase())!.BorrowAToken,
          eventAbi: abis.BorrowATokenV1.TransferUnscaled,
        }),
      )
    }

    const logsArray = await Promise.all(getLogsArray)

    logsArray.forEach((logs, j) => {
      logs.forEach((log) => {
        if (log.to.toLowerCase() === feeConfig.feeRecipient.toLowerCase()) {
          fees.add(FEE_MAPPING[j], Number(log.value));
        }
      })
    })
  }

  return {
    dailyFees: fees,
    dailyRevenue: fees,
    dailyProtocolRevenue: fees
  };
};

const methodology = "Swap fees are applied on every cash-for-credit trade, and fragmentation fees are charged on every credit split"

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: '2024-07-16',
      meta: {
        methodology: {
          Fees: methodology,
          ProtocolRevenue: methodology
        }
      }
    },
  }
}
export default adapter;

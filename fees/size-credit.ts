import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const SIZE_FACTORY = {
  [CHAIN.BASE]: '0x330Dc31dB45672c1F565cf3EC91F9a01f8f3DF0b',
  [CHAIN.ETHEREUM]: '0x3A9C05c3Da48E6E26f39928653258D7D4Eb594C1'
}

const abis = {
  SizeFactory: {
    getMarkets: 'function getMarkets() view returns (address[])',
  },
  Size: {
    feeConfig: "function feeConfig() view returns (uint256 swapFeeAPR,uint256 fragmentationFee,uint256 liquidationRewardPercent,uint256 overdueCollateralProtocolPercent,uint256 collateralProtocolPercent,address feeRecipient)",
    data: "function data() view returns (uint256 nextDebtPositionId,uint256 nextCreditPositionId,address underlyingCollateralToken,address underlyingBorrowToken,address collateralToken,address borrowAToken,address debtToken,address variablePool)",
  },
  ERC20: {
    Transfer: "event Transfer(address indexed from,address indexed to,uint256 value)",
  },
}

const fetch: any = async ({ createBalances, getLogs, api, }: FetchOptions, chain: keyof typeof SIZE_FACTORY) => {
  const fees = createBalances()

  const markets = await api.call({ abi: abis.SizeFactory.getMarkets, target: SIZE_FACTORY[chain] })
  const [datas, feeConfigs] = await Promise.all([
    api.multiCall({ abi: abis.Size.data, calls: markets }),
    api.multiCall({ abi: abis.Size.feeConfig, calls: markets }),
  ])

  for (let i = 0; i < markets.length; i++) {
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

    const logsArray = await Promise.all([
      getLogs({
        target: collateralToken,
        eventAbi: abis.ERC20.Transfer,
      }),
      getLogs({
        target: borrowAToken,
        eventAbi: abis.ERC20.Transfer,
      }),
    ])

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
  pullHourly: true,
  adapter: {
    [CHAIN.BASE]: {
      fetch: (options: any) => fetch(options, CHAIN.BASE),
      start: '2024-07-16',
    },
    [CHAIN.ETHEREUM]: {
      fetch: (options: any) => fetch(options, CHAIN.ETHEREUM),
      start: '2025-01-08',
    }
  },
  methodology: {
    Fees: methodology,
    ProtocolRevenue: methodology
  }
}
export default adapter;

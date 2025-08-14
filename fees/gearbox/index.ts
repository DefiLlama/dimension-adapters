import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { formatAddress } from "../../utils/utils";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { Balances, api2 } from "@defillama/sdk";

const ONE_ETHER_IN_WEI = 1e18
const ONE_RAY_IN_WEI = 1e27
const PERCENTAGE_FACTOR = 1e4

const GEARBOX_LIQUIDATION_FEE_TREASURY = '0x7b065fcb0760df0cea8cfd144e08554f3cea73d1'

const Abis = {
  LiquidateCreditAccount: 'event LiquidateCreditAccount(address indexed borrower,address indexed liquidator,address indexed to,uint256 remainingFunds)',
  LiquidateExpiredCreditAccount: 'event LiquidateExpiredCreditAccount(address indexed borrower,address indexed liquidator,address indexed to,uint256 remainingFunds)',
}

interface IGearboxService {
  version: 2 | 3;
  pool: string;
  creditManager?: string;
}

interface IGearboxChainConfig {
  services: Array<IGearboxService>
}

interface PrcessBalances {
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailySupplySideRevenue: Balances;
}

const configs: {[key: string]: IGearboxChainConfig} = {
  [CHAIN.ETHEREUM]: {
    services: [
      {
        version: 2,
        pool: '0x24946bcbbd028d5abb62ad9b635eb1b1a67af668', // DAI
        creditManager: '0x672461Bfc20DD783444a830Ad4c38b345aB6E2f7',
      },
      {
        version: 2,
        pool: '0x86130bdd69143d8a4e5fc50bf4323d48049e98e4', // USDC
        creditManager: '0x95357303f995e184A7998dA6C6eA35cC728A1900',
      },
      {
        version: 2,
        pool: '0xb03670c20f87f2169a7c4ebe35746007e9575901', // WETH
        creditManager: '0x5887ad4Cb2352E7F01527035fAa3AE0Ef2cE2b9B',
      },
      {
        version: 2,
        pool: '0xb2a015c71c17bcac6af36645dead8c572ba08a08', // WBTC
        creditManager: '0xc62BF8a7889AdF1c5Dc4665486c7683ae6E74e0F',
      },
      {
        version: 2,
        pool: '0xB8cf3Ed326bB0E51454361Fb37E9E8df6DC5C286', // wstETH
        creditManager: '0xe0bCE4460795281d39c91da9B0275BcA968293de',
      },
      {
        version: 2,
        pool: '0x79012c8d491dcf3a30db20d1f449b14caf01da6c', // FRAX
        creditManager: '0xA3E1e0d58FE8dD8C9dd48204699a1178f1B274D8',
      },

      {
        version: 3,
        pool: '0xda00000035fef4082F78dEF6A8903bee419FbF8E', // USDC
      },
      {
        version: 3,
        pool: '0xda00010eDA646913F273E10E7A5d1F659242757d', // WBTC
      },
      {
        version: 3,
        pool: '0xda0002859B2d05F66a753d8241fCDE8623f26F4f',
      },
      {
        version: 3,
        pool: '0x1DC0F3359a254f876B37906cFC1000A35Ce2d717',
      },
      {
        version: 3,
        pool: '0x4d56c9cBa373AD39dF69Eb18F076b7348000AE09',
      },
      {
        version: 3,
        pool: '0xe7146F53dBcae9D6Fa3555FE502648deb0B2F823',
      },
      {
        version: 3,
        pool: '0x05A811275fE9b4DE503B3311F51edF6A856D936e',
      },
      {
        version: 3,
        pool: '0x8EF73f036fEEC873D0B2fd20892215Df5B8Bdd72',
      },
    ],
  }
}

async function processV2Services(options: FetchOptions, balances: PrcessBalances, services: Array<IGearboxService>) {
  if (services.length > 0) {
    const dieselToTokens: {[key: string]: string} = {}
    const dieselToPrices: {[key: string]: number} = {}

    const underlyingTokens = await options.api.multiCall({
      abi: 'address:underlyingToken',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })
    const dieselTokens = await options.api.multiCall({
      abi: 'address:dieselToken',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })
    const fees = await options.api.multiCall({
      abi: 'function fees() view returns (uint16 feeInterest, uint16 feeLiquidation, uint16 liquidationDiscount, uint16 feeLiquidationExpired, uint16 liquidationDiscountExpired)',
      calls: services.map(service => service.creditManager as string),
      permitFailure: true,
    })

    const dieselSupplies = await options.api.multiCall({
      abi: 'uint256:totalSupply',
      calls: dieselTokens,
      permitFailure: true,
    })
    const dieselPrices = await options.api.multiCall({
      abi: 'function fromDiesel(uint256) view returns (uint256)',
      calls: services.map(service => service.pool).map((address: string) => { return { target: address, params: [String(ONE_ETHER_IN_WEI)] } }),
      permitFailure: true,
    })

    const dieselCumulativeIndexBefore = await options.fromApi.multiCall({
      abi: 'uint256:_cumulativeIndex_RAY',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })
    const dieselCumulativeIndexAfter = await options.toApi.multiCall({
      abi: 'uint256:_cumulativeIndex_RAY',
      calls: services.map(service => service.pool),
      permitFailure: true,
    })

    // count interest from growth CumulativeIndex for fees and supplySideRevenue
    for (let i = 0; i < services.length; i++) {
      const token = underlyingTokens[i]
      const { feeInterest } = fees[i]
      if (token) {
        const totalTokenBalance = Number(dieselSupplies[i]) * Number(dieselPrices[i]) / ONE_ETHER_IN_WEI
        const growthCumulativeIndex = Number(dieselCumulativeIndexAfter[i]) - Number(dieselCumulativeIndexBefore[i])
        const growthInterest = growthCumulativeIndex * totalTokenBalance / ONE_RAY_IN_WEI  

        const protocolInterestFee = Number(growthInterest) * Number(feeInterest) / PERCENTAGE_FACTOR
        const supplySideInterest = Number(growthInterest) - protocolInterestFee

        // we count growthInterest as fees
        balances.dailyFees.add(token, growthInterest, METRIC.BORROW_INTEREST)
        balances.dailySupplySideRevenue.add(token, supplySideInterest, METRIC.BORROW_INTEREST)
        balances.dailyRevenue.add(token, protocolInterestFee, METRIC.BORROW_INTEREST)
        balances.dailyProtocolRevenue.add(token, protocolInterestFee, METRIC.BORROW_INTEREST)

        dieselToTokens[formatAddress(dieselTokens[i])] = formatAddress(underlyingTokens[i])
        dieselToPrices[formatAddress(dieselTokens[i])] = Number(dieselPrices[i]) / ONE_ETHER_IN_WEI
      }
    }

    // // on liquidation or repay, count new minted diesel tokens for GEARBOX_LIQUIDATION_FEE_TREASURY as revenue
    // const transferLogs = await getEventLogs({
    //   chain: options.chain,
    //   targets: dieselTokens,
    //   eventAbi: 'event Transfer(address indexed from, address indexed to, uint256 value)',
    //   topics: [
    //     '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    //     '0x0000000000000000000000000000000000000000000000000000000000000000',
    //     evmAddressToEventTopic(GEARBOX_LIQUIDATION_FEE_TREASURY),
    //   ],
    //   fromBlock: Number(options.fromApi.block),
    //   toBlock: Number(options.toApi.block),
    //   onlyArgs: false,
    //   flatten: true,
    // });
    // for (const event of transferLogs) {
    //   const dieselToken = formatAddress(event.address)
    //   const tokenAmount = dieselToPrices[dieselToken] * Number(event.args.value)

    //   if (LiquidateCreditAccountEvents.find(liqEvent => liqEvent.transactionHash === event.transactionHash) || LiquidateExpiredCreditAccountEvents.find(liqEvent => liqEvent.transactionHash === event.transactionHash)) {
    //     console.log('liq', event.transactionHash)
        
    //     // we detect liquidation by LiquidateCreditAccount LiquidateExpiredCreditAccount emitted in the same transaction
    //     balances.dailyFees.add(dieselToTokens[dieselToken], tokenAmount, METRIC.LIQUIDATION_FEES)
    //     balances.dailyRevenue.add(dieselToTokens[dieselToken], tokenAmount, METRIC.LIQUIDATION_FEES)
    //     balances.dailyProtocolRevenue.add(dieselToTokens[dieselToken], tokenAmount, METRIC.LIQUIDATION_FEES)
    //   } else {
    //     console.log(event.transactionHash)
    //     // otherwise, normal repay transactions
    //     // balances.dailyRevenue.add(dieselToTokens[dieselToken], tokenAmount, METRIC.BORROW_INTEREST)
    //     // balances.dailyProtocolRevenue.add(dieselToTokens[dieselToken], tokenAmount, METRIC.BORROW_INTEREST)

    //     // don't need add interest to fees and supplySideRevenue, because we have already do it above
    //   }
    // }
  }
}

async function processV3Services(options: FetchOptions, balances: PrcessBalances, services: Array<IGearboxService>) {
  const assets = await options.api.multiCall({
    abi: 'address:asset',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })
  const totalAssets = await options.api.multiCall({
    abi: 'uint256:totalAssets',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })
  const decimals = await options.api.multiCall({
    abi: 'uint8:decimals',
    calls: services.map(service => service.pool),
    permitFailure: true,
  })

  const cumulativeIndexBefore = await options.fromApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: services.map((service, index) => {
      return {
        target: service.pool,
        params: [String(10**Number(decimals[index]))],
      }
    }),
    permitFailure: true,
  })
  const cumulativeIndexAfter = await options.toApi.multiCall({
    abi: 'function convertToAssets(uint256) view returns (uint256)',
    calls: services.map((service, index) => {
      return {
        target: service.pool,
        params: [String(10**Number(decimals[index]))],
      }
    }),
    permitFailure: true,
  })

  // count interest from growth CumulativeIndex for fees and supplySideRevenue
  for (let i = 0; i < services.length; i++) {
    const token = assets[i]
    if (token) {
      const totalTokenBalance = Number(totalAssets[i])
      const growthCumulativeIndex = Number(cumulativeIndexAfter[i]) - Number(cumulativeIndexBefore[i])
      const growthInterest = growthCumulativeIndex * totalTokenBalance / (10**Number(decimals[i]))

      console.log({pool: services[i].pool, token, totalTokenBalance, cumulativeIndexAfter: cumulativeIndexAfter[i], cumulativeIndexBefore: cumulativeIndexBefore[i]}, growthInterest)

      // we count growthInterest as fees
      balances.dailyFees.add(token, growthInterest, METRIC.BORROW_INTEREST)
      balances.dailySupplySideRevenue.add(token, growthInterest, METRIC.BORROW_INTEREST)
    }
  }
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const config = configs[options.chain]
  
  await processV2Services(options, { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }, config.services.filter(service => service.version === 2))
  await processV3Services(options, { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }, config.services.filter(service => service.version === 3))

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
    }
  },
  // when credit accounts repay loans, if repaid amount exceeds loans, remaining amount will be taken as profit for treasury
  // if repaid amount is not enough to cover loans, tresury transfer funds to cover the loss
  allowNegativeValue: true,
}

export default adapter;

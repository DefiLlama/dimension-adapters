import { CallsParams } from "@defillama/sdk/build/types";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { formatAddress } from "../../utils/utils";
import { addOneToken } from "../../helpers/prices";

const FEE_DENOMINATOR = 1e10

enum ContractVersion {
  main = 'main',
  stablefactory = 'stablefactory',
  factory_twocrypto = 'factory_twocrypto',
  factory_stable_ng = 'factory_stable_ng',
}

interface IContractAbi {
  TokenExchange: string;
}

interface ICurveDexConfig {
  start: string;
  stableFactories?: Array<string>;
  twocryptosFactories?: Array<string>;
  ngStableFactories?: Array<string>;
  customPools: {
    // version => pools
    [key: string]: Array<string>;
  };
}

interface IDexPool {
  pool: string;
  tokens: Array<string>;
  feeRate: number;
  adminFeeRate: number;
}

interface ITokenExchangeEvent {
  pool: string;
  sold_id: number;
  tokens_sold: number;
  bought_id: number;
  tokens_bought: number;
}

const CurveContractAbis: { [key: string]: IContractAbi } = {
  [ContractVersion.main]: {
    TokenExchange: 'event TokenExchange(address indexed buyer, int128 sold_id, uint256 tokens_sold, int128 bought_id, uint256 tokens_bought)',
  },
}

const CurveDexConfigs: {[key: string]: ICurveDexConfig} = {
  [CHAIN.ETHEREUM]: {
    start: '2020-09-06',
    stableFactories: [
      '0xb9fc157394af804a3578134a6585c0dc9cc990d4',
    ],
    twocryptosFactories: [
      '0x98ee851a00abee0d95d08cf4ca2bdce32aeaaf7f',
    ],
    ngStableFactories: [
      '0x6a8cbed756804b16e05e741edabd5cb544ae21bf',
    ],
    customPools: {
      [ContractVersion.main]: [
        '0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7', // DAI/USDC/USDT
        '0xDeBF20617708857ebe4F679508E7b7863a8A8EeE', // aDAI/aUSDC/aUSDT
        '0xA96A65c051bF88B4095Ee1f2451C2A9d43F53Ae2',
        '0x79a8C46DeA5aDa233ABaFFD40F3A0A2B1e5A4F27',
        '0xA2B47E3D5c44877cca798226B7B8118F9BFb7A56',
        '0x0Ce6a5fF5217e38315f87032CF90686C96627CAA',
        '0x4CA9b3063Ec5866A4B82E437059D2C43d1be596F',
        '0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF',
        '0xF178C0b5Bb7e7aBF4e12A4838C7b7c5bA2C623c0',
        '0x06364f10B501e868329afBc005b3492902d6C763',
        '0x93054188d876f558f4a66B2EF1d97d16eDf0895B',
        '0xEB16Ae0052ed37f479f7fe63849198Df1765a733',
        '0x7fC77b5c7614E1533320Ea6DDc2Eb61fa00A9714',
        '0xc5424B857f758E906013F3555Dad202e4bdB4567',
        '0xDC24316b9AE028F1497c275EB9192a3Ea0f67022',
        '0xA5407eAE9Ba41422680e2e00537571bcC53efBfD',
        '0x52EA46506B9CC5Ef470C5bf89f17Dc28bB35D85C',
        '0x45F783CCE6B7FF23B2ab2D70e416cdb7D6055f51',
        '0x8038C01A0390a8c547446a0b2c18fc9aEFEcc10c',
        '0x4f062658EaAF2C1ccf8C8e36D6824CDf41167956',
        '0x3eF6A01A0f81D6046290f3e2A8c5b843e738E604',
        '0xE7a24EF0C5e95Ffb0f6684b813A78F2a3AD7D171',
        '0x8474DdbE98F5aA3179B3B3F5942D724aFcdec9f6',
        '0xC18cC39da8b11dA8c3541C598eE022258F9744da',
        '0x3E01dD8a5E1fb3481F0F589056b428Fc308AF0Fb',
        '0x0f9cb53Ebe405d49A0bbdBD291A65Ff571bC83e1',
        '0x42d7025938bEc20B69cBae5A77421082407f053A',
        '0x890f4e345B1dAED0367A877a1612f86A1f86985f',
        '0x071c661B4DeefB59E2a3DdB20Db036821eeE8F4b',
        '0xd81dA8D904b52208541Bade1bD6595D8a251F8dd',
        '0x7F55DDe206dbAD629C080068923b36fe9D6bDBeF',
        '0xC25099792E9349C7DD09759744ea681C7de2cb66',
        '0xEcd5e75AFb02eFa118AF914515D6521aaBd189F1',
        '0xEd279fDD11cA84bEef15AF5D39BB4d4bEE23F0cA',
        '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B',
        '0x4807862AA8b2bF68830e4C8dc86D0e9A998e085a',
        '0xF9440930043eb3997fc70e1339dBb11F341de7A8',
        '0x43b4FdFD4Ff969587185cDB6f0BD875c5Fc83f8c',
        '0x80466c64868E1ab14a1Ddf27A676C3fcBE638Fe5',
        '0x618788357D0EBd8A37e763ADab3bc575D54c2C7d',
        '0x5a6A4D54456819380173272A5E8E9B9904BdF41B',
        '0xFD5dB7463a3aB53fD211b4af195c5BCCC1A03890',
        '0x4e0915C88bC70750D68C481540F081fEFaF22273',
        '0x1005F7406f32a61BD760CfA14aCCd2737913d546',
        '0xDcEF968d416a41Cdac0ED8702fAC8128A64241A2',
        '0xa1F8A6807c402E4A15ef4EBa36528A3FED24E577',
        '0xf253f83AcA21aAbD2A20553AE0BF7F65C755A07F',
        '0xaE34574AC03A15cd58A92DC79De7B1A0800F1CE3',
        '0xBfAb6FA95E0091ed66058ad493189D2cB29385E6',
      ]
    }
  },
}

async function getPoolTokens(options: FetchOptions, poolAddresses: Array<string>): Promise<{[key: string]: IDexPool}> {
  const pools: {[key: string]: IDexPool} = {}

  const coinsCalls: Array<CallsParams> = []
  for (const poolAddress of poolAddresses) {
    for (let i = 0; i < 5; i++) {
      coinsCalls.push({
        target: poolAddress,
        params: [i],
      })
    }
  }

  const coinsResults = await options.api.multiCall({
    abi: 'function coins(uint256) view returns (address)',
    calls: coinsCalls,
    permitFailure: true,
  })
  const coinsOldResults = await options.api.multiCall({
    abi: 'function coins(int128) view returns (address)',
    calls: coinsCalls,
    permitFailure: true,
  })
  const feeResults = await options.api.multiCall({
    abi: 'function fee() view returns (uint256)',
    calls: poolAddresses,
    permitFailure: true,
  })
  const adminFeeResults = await options.api.multiCall({
    abi: 'function admin_fee() view returns (uint256)',
    calls: poolAddresses,
    permitFailure: true,
  })

  for (let i = 0; i < poolAddresses.length; i++) {
    let tokens = coinsResults.slice(i * 5 , i * 5 + 5).filter(item => item !== null)
    if (tokens.length === 0) {
      tokens = coinsOldResults.slice(i * 5 , i * 5 + 5).filter(item => item !== null)
    }

    pools[poolAddresses[i]] = {
      pool: poolAddresses[i],
      tokens: tokens,
      feeRate: feeResults[i] ? Number(feeResults[i]) / FEE_DENOMINATOR : 0,
      adminFeeRate: adminFeeResults[i] ? Number(adminFeeResults[i]) / FEE_DENOMINATOR : 0,
    }
  }

  return pools;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const config = CurveDexConfigs[options.chain]

  const tokenExchangeEvents: Array<ITokenExchangeEvent> = [];
  const uniquePoolAddresses: {[key: string]: boolean} = {}

  // swap logs - main
  for (const [version, pools] of Object.entries(config.customPools)) {
    const swapLogs = await options.getLogs({
      targets: pools,
      eventAbi: CurveContractAbis[version].TokenExchange,
      flatten: true,
      onlyArgs: false,
    });

    for (const log of swapLogs) {
      uniquePoolAddresses[formatAddress(log.address)] = true
      tokenExchangeEvents.push({
        pool: formatAddress(log.address),
        sold_id: Number(log.args.sold_id),
        tokens_sold: Number(log.args.tokens_sold),
        bought_id: Number(log.args.bought_id),
        tokens_bought: Number(log.args.tokens_bought),
      })
    }
  }

  const pools = await getPoolTokens(options, Object.keys(uniquePoolAddresses))

  for (const event of tokenExchangeEvents) {
    const token0 = pools[event.pool].tokens[event.sold_id]
    const token1 = pools[event.pool].tokens[event.bought_id]
    const feeRate = pools[event.pool].feeRate
    const adminFeeRate = pools[event.pool].adminFeeRate
    const amount0 = Number(event.tokens_sold)
    const amount1 = Number(event.tokens_bought)

    addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 })
    addOneToken({ chain: options.chain, balances: dailyFees, token0, token1, amount0: amount0 * feeRate, amount1: amount1 * feeRate })
    addOneToken({ chain: options.chain, balances: dailyRevenue, token0, token1, amount0: amount0 * feeRate * adminFeeRate, amount1: amount1 * feeRate * adminFeeRate })
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(CurveDexConfigs).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch,
        start: CurveDexConfigs[chain].start,
      }
    }
  }, {})
};

export default adapter;

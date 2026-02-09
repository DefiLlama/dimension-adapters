import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEulerVaultFee } from "../helpers/curators/index";

/**
 * 
 * Usual takes RWA stablecoins from users and issue USD0 stablecoins
 * Users can stake USD0, receive USD0++ and earn USUAL tokens
 * Users can stake USUAL, receive USUALx and earn USUAL tokens
 * Users can stake USD0, reveive sUSD0 and earn USD0 tokens
 * Users can stake USD0, receive USD0a and earn USD0 tokens
 * Users can lock USUALx and earn USD0 tokens
 * 
 * Here are the places where Usual takes fees:
 * 1. Usual earns fees from locked RWA assets
 * 2. When users redeem USD0 stablecoins, Usual takes an amount of redemption fees in USD0 tokens
 * 3. When users early unstake USD0++ at floor price
 * 4. When users early unstake USD0++, users must commit an amount of USUAL tokens
 *    these USUAL tokens then are burnt and distributed to USUALx stakers
 * 5. Usual deployed Euler vaults for borrowing and takes borrow interest
 * 6. Usual deployed vaults to deposit USD0++ and distribute USUAL to depositors when user withdraws, a fee is applied and a management fee is harvested on the vault.
 * 7. When users stake USD0, they receive sUSD0 or USD0a, or when they lock USUALx, they get rewarded USD0 tokens 
 * 
 * 
 * So:
 * We count 1, 2, 3, 5, 6 as protocol revenue
 * We count 4, 7 as holder revenue
 * 
 * There is no source of revenue for supply side users - USD0 minters.
 * Rewarded USUAL tokens to USD0++ and USUALx stakers are incentive from Usual, not from RWA assets yield.
 * 
 */

const methodology = {
  Fees: 'Yields from underlying assets,usual stability loan interests, total USD0 redemption fees and USD0++ early unstake fees.',
  Revenue: 'Total fees collected by protocol, distributed to USUAL token stakers, buyback and burn.',
  ProtocolRevenue: 'Total fees are distributed to protocol treasury.',
  HoldersRevenue: 'Total fees are distributed to token holders, token burns',
}
const RDMUSD0 = '0x6ec631c19372d5a9345Ec4aeED93BA9eb0A45F77'
const DaoCollateral = '0xde6e1F680C4816446C8D515989E2358636A38b04'
const USD0aDaoCollateral = '0xecD854A1a0ddd5f35F2F24eC3605D8BAebF77039'
const EUR0DaoCollateral = '0xB9677b45BffBE3d586D2AE2cbCD1775577B166D1'
const ETH0DaoCollateral = '0xAAD0a80fB8F0DA4799E457b5Ae8EA70Fa61a45fc'
const Treasury = '0xdd82875f0840AAD58a455A70B88eEd9F59ceC7c7'
const Eur0Treasury = '0x11D75bC93aE69350231D8fF0F5832A697678183E'
const ETH0Treasury = '0xc912B5684a1dF198294D8b931B3926a14d700F64'
const USD0 = ADDRESSES.ethereum.USD0
const USD0a = '0x2e7fC02bE94BC7f0cD69DcAB572F64bcC173cd81'
const SUSDS = ADDRESSES.ethereum.sUSDS
const WSTETH = ADDRESSES.ethereum.WSTETH
const EUTBL =  '0xa0769f7A8fC65e47dE93797b4e21C073c117Fc80'
const EUTBLOracle = '0xfD628af590c4150A9651C1f4ddD0b4f532B703ae'
const EURUSDOracle = '0xb49f677943BC038e9857d61E7d053CaA2C1734C1'
const ETHUSDOracle = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419'

const USUAL = '0xc4441c2be5d8fa8126822b9929ca0b81ea0de38e'
const USD0PP = '0x35d8949372d46b7a3d5a56006ae77b215fc69bc0'
const USUALX = '0x06B964d96f5dCF7Eae9d7C559B09EDCe244d4B8E'

const USYC = '0x136471a34f6ef19fe571effc1ca711fdb8e49f2b'
const USYCOracle = '0x4c48bcb2160F8e0aDbf9D4F3B034f1e36d1f8b3e'
const wM = '0x437cc33344a0B27A429f795ff6B469C72698B291'
const USUAL_wM = '0x4Cbc25559DbBD1272EC5B64c7b5F48a2405e6470'
const EULER_VAULTS = ['0xd001f0a15D272542687b2677BA627f48A4333b5d']
const USUAL_VAULTS = ['0x67ec31a47a4126A66C7bb2fE017308cf5832A4Db']

// Uniswap V3 pool and treasury 
const UNISWAP_V3_TREASURY = '0xc32e2a2F03d41768095e67b62C9c739f2C2Bc4aA'
const UNISWAP_V3_POSITION_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88' // Ethereum mainnet
 
const ContractAbis = {
 
  // Oracle
  chainlinkOraclePrice: 'function latestRoundData() view returns(uint80 roundId, int256 answer, uint256 startAt, uint256 updatedAt, uint80 answeredInRound)',

  // wstETH
  stEthPerToken: 'function stEthPerToken() view returns (uint256)',

  // USYC
  balanceOf: 'function balanceOf(address) view returns (uint256 balance)',
  usycOraclePrice: 'function latestRoundData() view returns(uint80 roundId, int256 answer, uint256 startAt, uint256 updatedAt, uint80 answeredInRound)',

  // wM
  currentIndex: 'uint256:currentIndex',

  // users redeem USD0 to RWA stablecoins
  RedeemEvent: 'event Redeem(address indexed redeemer, address indexed rwaToken, uint256 amountRedeemed, uint256 returnedRwaAmount, uint256 stableFeeAmount)',

  // collect USUAL paid by early unstake bUSD0 users
  FeeSweptEvent: 'event FeeSwept(address indexed caller, address indexed collector, uint256 amount)',

  // harvest management fee from vaults
  HarvestManagementFeeEvent: 'event Harvested(address indexed caller, uint256 sharesMinted)',

  // harvest USD0a fees 
  HarvestUSD0aEvent: 'event Harvest(uint256 amount)',
  
  // collect USD0 fees to treasury
  Usd0ppUnlockedFloorPriceEvent: 'event Usd0ppUnlockedFloorPrice(address indexed user, uint256 usd0ppAmount, uint256 usd0Amount)',

  // distribute USD0 to sUSD0 stakers
  accruingDTDistributed: 'event AccruingDTDistributed(uint256 amount, uint256 timestamp)',
  // distribute USD0 to USD0a stakers
  rebasingDTDistributed: 'event RebasingDTDistributed(uint256 amount, uint256 timestamp)',
  // distribute USD0 to Usualx lockers
  revenueSwitchDistributed: 'event RevenueSwitchDistributed(uint256 amount, uint256 timestamp)',
  
  // Uniswap V3 NonfungiblePositionManager
  positions: 'function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
  CollectEvent: 'event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)',
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const redeemEvents: Array<any> = await options.getLogs({
    targets: [DaoCollateral,USD0aDaoCollateral, EUR0DaoCollateral, ETH0DaoCollateral],
    eventAbi: ContractAbis.RedeemEvent,
  })
  const feeSweptEvents: Array<any> = await options.getLogs({
    targets: [USD0PP,USUALX],
    eventAbi: ContractAbis.FeeSweptEvent,
  })
  const harvestManagementFeeEvents: Array<any> = await options.getLogs({
    targets: USUAL_VAULTS,
    eventAbi: ContractAbis.HarvestManagementFeeEvent,
  })
  const harvestUSD0aEvents: Array<any> = await options.getLogs({
    target: USD0a,
    eventAbi: ContractAbis.HarvestUSD0aEvent,
  })
  const usd0ppUnlockedFloorPriceEvents: Array<any> = await options.getLogs({
    target: USD0PP,
    eventAbi: ContractAbis.Usd0ppUnlockedFloorPriceEvent,
  })

  const sUsd0DistributedEvents: Array<any> = await options.getLogs({
    target: RDMUSD0,
    eventAbi: ContractAbis.accruingDTDistributed,
  })
  const usd0aDistributedEvents: Array<any> = await options.getLogs({
    target: RDMUSD0,
    eventAbi: ContractAbis.rebasingDTDistributed,
  })
  const UsualxDistributedEvents: Array<any> = await options.getLogs({
    target: RDMUSD0,
    eventAbi: ContractAbis.revenueSwitchDistributed,
  })

  for (const event of redeemEvents) {
    dailyFees.add(USD0, Number(event.stableFeeAmount))
    dailyProtocolRevenue.add(USD0, Number(event.stableFeeAmount))
  }
  
  for (const event of feeSweptEvents) {
    dailyFees.add(USUAL, Number(event.amount))

    // https://docs.usual.money/usual-products/usd0-liquid-staking-token/usd0++-early-redemption-mechanism#how-does-it-work
    //67% of the fees are distributed to USUALx,Usual* stakers
    //33% of the fees are burnt
    dailyHoldersRevenue.add(USUAL, Number(event.amount))
  }

  for (const event of harvestManagementFeeEvents) {
    dailyFees.add(SUSDS, Number(event.sharesMinted))
    dailyProtocolRevenue.add(SUSDS, Number(event.sharesMinted))
  } 

  for (const event of harvestUSD0aEvents) {
    dailyFees.add(USD0a, Number(event.amount))
    dailyProtocolRevenue.add(USD0a, Number(event.amount))
  }

  for (const event of usd0ppUnlockedFloorPriceEvents) {
    const feeAmount = Number(event.usd0ppAmount) - Number(event.usd0Amount)

    dailyFees.add(USD0, feeAmount)
    dailyProtocolRevenue.add(USD0, feeAmount)
  }

  dailyRevenue.add(dailyHoldersRevenue)

  for (const event of sUsd0DistributedEvents) {
    // not added to dailyFees because USD0 is minted from RWA yield
    dailyHoldersRevenue.add(USD0, Number(event.amount))
  }

  for (const event of usd0aDistributedEvents) {
    // not added to dailyFees because USD0 is minted from RWA yield
    dailyHoldersRevenue.add(USD0, Number(event.amount))
  }

  for (const event of UsualxDistributedEvents) {
    // not added to dailyFees because USD0 is minted from RWA yield
    dailyHoldersRevenue.add(USD0, Number(event.amount))
  }

  // get fees earned by USYC
  const usycBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: USYC,
    params: [Treasury],
  })
  const [, oldPrice, , ,] = await options.fromApi.call({
    abi: ContractAbis.usycOraclePrice,
    target: USYCOracle,
  })
  const [, newPrice, , ,] = await options.toApi.call({
    abi: ContractAbis.usycOraclePrice,
    target: USYCOracle,
  })
  // price decimals: 8, USYC decimals: 6
  const usycYield = (Number(newPrice) - Number(oldPrice)) * usycBalance / 1e14

  // get fees earned by eutbl
  const eutblBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: EUTBL,
    params: [Eur0Treasury],
  })
  const [, oldEutblPrice, , ,] = await options.fromApi.call({
    abi: ContractAbis.chainlinkOraclePrice,
    target: EUTBLOracle,
  })


  const [, newEutblPrice, , ,] = await options.toApi.call({
    abi: ContractAbis.chainlinkOraclePrice,
    target: EUTBLOracle,
  })

  const [, eurUsdPrice, , ,] = await options.api.call({
    abi: ContractAbis.chainlinkOraclePrice,
    target: EURUSDOracle,
  })

  // price decimals: 6, eutbl decimals: 5
  const eutblYieldInEur  = ((Number(newEutblPrice) - Number(oldEutblPrice)) * Number(eutblBalance) )/ 1e11
  // price decimals: 8 
  const eutblYieldInUsd = (eutblYieldInEur * Number(eurUsdPrice)) / 1e8

  // get fees earned by wstETH
  const wstEthBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: WSTETH,
    params: [ETH0Treasury],
  })
  const oldWstEthPrice = await options.fromApi.call({
    abi: ContractAbis.stEthPerToken,
    target: WSTETH,
  })
  const newWstEthPrice = await options.toApi.call({
    abi: ContractAbis.stEthPerToken,
    target: WSTETH,
  })
  const [, ethUsdPrice, , ,] = await options.api.call({
    abi: ContractAbis.chainlinkOraclePrice,
    target: ETHUSDOracle,
  })
  // price decimals: 18, wstETH decimals: 18
  const wstEthYieldInEth = ((Number(newWstEthPrice) - Number(oldWstEthPrice)) * Number(wstEthBalance)) / 1e36
  // price decimals: 8
  const wstEthYieldInUsd = (wstEthYieldInEth * Number(ethUsdPrice)) / 1e8

  // get fees earned by wM
  const wMBalance = await options.api.call({
    abi: ContractAbis.balanceOf,
    target: wM,
    params: [USUAL_wM],
  })
  const oldIndex = await options.fromApi.call({
    abi: ContractAbis.currentIndex,
    target: wM,
  })
  const newIndex = await options.toApi.call({
    abi: ContractAbis.currentIndex,
    target: wM,
  })
  // index decimals: 12, wM decimals: 6
  const mYield = (Number(newIndex) - Number(oldIndex)) * wMBalance / 1e18

  const totalRwaYield = usycYield + mYield + eutblYieldInUsd + wstEthYieldInUsd
  
  dailyFees.addUSDValue(totalRwaYield)
  dailyProtocolRevenue.addUSDValue(totalRwaYield)


  // Uniswap Fee earned through liquidity deployment
  // Track Collect events from NonfungiblePositionManager where recipient is the treasury
  const collectEvents: Array<any> = await options.getLogs({
    target: UNISWAP_V3_POSITION_MANAGER,
    eventAbi: ContractAbis.CollectEvent,
  })
  // Filter for events where recipient is the treasury and verify the position is in our pool
  const treasuryCollectEvents = collectEvents.filter((event: any) => 
    event.recipient?.toLowerCase() === UNISWAP_V3_TREASURY.toLowerCase()
  ) 
  // Verify each position belongs to our pool and sum fees
  for (const event of treasuryCollectEvents) {
  
      const position = await options.api.call({
        abi: ContractAbis.positions,
        target: UNISWAP_V3_POSITION_MANAGER,
        params: [event.tokenId],
      })
      if (
        position.token0 &&
        position.token1
      ) {
        dailyFees.add( position.token0, Number(event.amount0))
        dailyFees.add( position.token1, Number(event.amount1))
        dailyProtocolRevenue.add( position.token0, Number(event.amount0))
        dailyProtocolRevenue.add( position.token1, Number(event.amount1))
      }
 
  }

  await getEulerVaultFee(options, { dailyFees, dailyRevenue, dailySupplySideRevenue }, EULER_VAULTS)
  dailyRevenue.add(dailyProtocolRevenue)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: '2024-05-24',
    },
  },
  methodology,
};

export default adapter;

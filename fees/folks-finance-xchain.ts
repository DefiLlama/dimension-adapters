import * as sdk from '@defillama/sdk'
import { Adapter, FetchOptions, FetchResult } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// Folks Finance xChain — hub-and-spoke money market.
// All lending state lives in HubPool contracts on Avalanche; spoke chains only forward messages.
// grossInterest = (varDebt*varRate + stableDebt*avgStableRate) * dt / year  (rates 18 d.p.)
// protocolRevenue = grossInterest * retentionRate  (per-pool, 6 d.p., currently 10%)
// supplySideRevenue = grossInterest - protocolRevenue

const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n
const RATE_DP = 10n ** 18n // interest rates are 18 d.p.
const RETENTION_DP = 1_000_000n // retentionRate is 6 d.p.

const getVariableBorrowDataAbi =
  'function getVariableBorrowData() view returns (uint32 vr0, uint32 vr1, uint32 vr2, uint256 totalAmount, uint256 interestRate, uint256 interestIndex)'
const getStableBorrowDataAbi =
  'function getStableBorrowData() view returns (uint32 sr0, uint32 sr1, uint32 sr2, uint32 sr3, uint16 optimalStableToTotalDebtRatio, uint16 rebalanceUpUtilisationRatio, uint16 rebalanceUpDepositInterestRate, uint16 rebalanceDownDelta, uint256 totalAmount, uint256 interestRate, uint256 averageInterestRate)'
const getFeeDataAbi =
  'function getFeeData() view returns (uint32 flashLoanFee, uint32 retentionRate, address fTokenFeeRecipient, address tokenFeeClaimer, uint256 totalRetainedAmount, bytes32 tokenFeeRecipient)'

// wrapped native per source chain, used to price gas-coin pools
const WRAPPED_NATIVE: { [chain: string]: string } = {
  avax: '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7',
  ethereum: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
  base: '0x4200000000000000000000000000000000000006',
  bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
  arbitrum: '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
  polygon: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270',
  sei: '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
  monad: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
}

// source: https://github.com/Folks-Finance/xchain-js-sdk
const HUB_POOLS: { [chain: string]: Array<{ pool: string; token: string }> } = {
  avax: [
    { pool: '0x88f15e36308ED060d8543DA8E2a5dA0810Efded2', token: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e' },
    { pool: '0x0259617bE41aDA4D97deD60dAf848Caa6db3F228', token: 'native' },
    { pool: '0x7033105d1a527d342bE618ab1F222BB310C8d70b', token: '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be' },
    { pool: '0x795CcF6f7601edb41E4b3123c778C56F0F19389A', token: '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab' },
    { pool: '0x1C51AA1516e1156d98075F2F64e259906051ABa9', token: '0x152b9d0fdc40c096757f570a51e494bd4b943e50' },
    { pool: '0x307bCEC89624660Ed06C97033EDb7eF49Ab0EB2D', token: '0xbc78D84Ba0c46dFe32cf2895a19939c86b81a777' },
    { pool: '0x5e5a2007a8D613C4C98F425097166095C875e6eE', token: '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd' },
    { pool: '0xAdA5Be2A259096fd11D00c2b5c1181843eD008DC', token: '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3' },
    { pool: '0x9f59642C6733397dF5c2696D3Ac9ceb431b1b573', token: '0x2f643d728926C20269f0A04931dd7b4b6B650204' },
    { pool: '0xc7DdB440666c144c2F27a3a5156D636Bacfc769C', token: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' },
    { pool: '0xE6B7713854620076B5716E2743262D315bf8609D', token: '0x06d47F3fb376649c3A9Dafe069B3D6E35572219E' },
    { pool: '0xA1E1024c49c77297bA6367F624cFbEFC80E697c6', token: '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7' },
    { pool: '0x13A21bC65844CD530098Ab15431c57078ea90737', token: '0x2cd3CdB3bd68Eea0d3BE81DA707bC0c8743D7335' },
    { pool: '0x5431e7f480C4985e9C3FaAcd3Bd1fc7143eAdEFa', token: '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34' },
    { pool: '0x94307E63eF02Cf9B39894553f14b21378Ef20adB', token: '0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2' },
    { pool: '0x3F87F3B301f031ba59C479EDF067621DcC72DDca', token: '0xc891eb4cbdeff6e073e859e987815ed1505c2acd' },
    { pool: '0x5FE123B659FC5242f46884C37550F05Ef08C816a', token: '0xd09ACb80C1E8f2291862c4978A008791c9167003' },
    { pool: '0x3F63A6401e6354a486e6a38127409fD16e222B59', token: '0x14A84F1a61cCd7D1BE596A6cc11FE33A36Bc1646' },
    { pool: '0x42Bb92684e72707030F59C48FBe5A222A0d8b387', token: '0x601486C8Fdc3aD22745b01c920037d6c036A38B9' },
  ],
  ethereum: [
    { pool: '0xB6DF8914C084242A19A4C7fb15368be244Da3c75', token: 'native' },
    { pool: '0x9936812835476504D6Cf495F4F0C718Ec19B3Aff', token: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599' },
    { pool: '0x391201cEC4F80e69C87Dee364d599c1FCAE3c363', token: '0xbe0Ed4138121EcFC5c0E56B40517da27E6c5226B' },
    { pool: '0x279b3E185F64e99141d4CE363657A5F3B5B32Fb9', token: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8' },
    { pool: '0x7178bF2a8A50153549e0d95A4C6Cb816448840F0', token: '0x8292bb45bf1ee4d140127049757c2e0ff06317ed' },
    { pool: '0xe7897052FAC4bfF9EB3ABc073CBC1e17Fce5709C', token: '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0' },
    { pool: '0x4E6dD5E35638008cdB1E9004F3E952bCDd920E6D', token: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee' },
    { pool: '0xf51a72b92cB9C16376Da04f48eF071c966B9C50B', token: '0xdac17f958d2ee523a2206206994597c13d831ec7' },
    { pool: '0xD4F87eb6cc8795e727F7DbC1e2C6c3452ad0010c', token: '0x643C4E15d7d62Ad0aBeC4a9BD4b001aA3Ef52d66' },
  ],
  base: [
    { pool: '0x51958ed7B96F57142CE63BB223bbd9ce23DA7125', token: 'native' },
    { pool: '0x9eD81F0b5b0E9b6dE00F374fFc7f270902576EF7', token: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' },
    { pool: '0xb5327c35E083248E3a0f79122FaB3b6018e5584a', token: '0x940181a94a35a4569e4529a3cdfb74e38fd98631' },
    { pool: '0x0b09E1Ffd28040654021A85A49284597F3d0e41C', token: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22' },
    { pool: '0xC96820695217c7dd8F696f8892de76F7a48432CB', token: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452' },
    { pool: '0xf727EC8D6e565328f2cf0Ff8aC4e7c9e7f8d24B2', token: '0x04C0599Ae5A44757c0af6F9eC3b93da8976c150A' },
    { pool: '0x331a1938f94af7bB41d57691119Aee416495202a', token: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b' },
    { pool: '0x04C8B9d8AF87a6D670B646125B2D99740D8eBa5E', token: '0x98d0baa52b2D063E780DE12F615f963Fe8537553' },
  ],
  bsc: [
    { pool: '0x89970d3662614a5A4C9857Fcc9D9C3FA03824fe3', token: 'native' },
    { pool: '0x18031B374a571F9e060de41De58Abb5957cD5258', token: '0x2170ed0880ac9a755fd29b2688956bd959f933f8' },
    { pool: '0xC2FD40D9Ec4Ae7e71068652209EB75258809e131', token: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c' },
  ],
  arbitrum: [
    { pool: '0x44E0d0809AF8Ee37BFb1A4e75D5EF5B96F6346A3', token: 'native' },
    { pool: '0x1177A3c2CccDb9c50D52Fc2D30a13b2c3C40BCF4', token: '0x912ce59144191c1204e64559fe8253a0e49e6548' },
    { pool: '0x3445055F633fEF5A64F852aaCD6dA76143aCA109', token: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f' },
    { pool: '0xdd9eFBf83572f5387381aD3A04b1318221d545A2', token: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40' },
    { pool: '0x9f0c0aDEc9fd4ef946aCe1e2b4F32e49aE45C8F3', token: '0x5979D7b546E38E414F7E9822514be443A4800529' },
    { pool: '0x78B4e5cda33C898b546dB7925162879E7bd2A9d1', token: '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe' },
    { pool: '0x60f2682Ab38e3C9a51b07fbd69f42Ad2Cfe731db', token: '0x4186BFC76E2E237523CBC30FD220FE055156b41F' },
    { pool: '0x1b5a1dCe059E6069Ed33C3656826Ad04bE536465', token: '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9' },
  ],
  polygon: [
    { pool: '0x481cF0c02BF17a33753CE32f1931ED9990fFB40E', token: 'native' },
    { pool: '0x7054254933279d93D97309745AfbFF9310cdb570', token: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6' },
    { pool: '0x88Ae56886233C706409c74c3D4EA9A9Ac1D65ab2', token: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619' },
    { pool: '0xD77b920A9c05B3e768FEaE0bcB5839cd224328fE', token: '0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD' },
    { pool: '0x84C420D5e077cF0ed8a20c44d803C380172eD5D5', token: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39' },
    { pool: '0x59023eFDB22B9d8b2C7aeD842aC1fd2f6110e5B5', token: '0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6' },
    { pool: '0x34f1BA5808EB5Bf60c9B1C343d86e410466F4860', token: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' },
    { pool: '0x11f82b5Ea7408Ff257F6031E6A3e29203557A1DD', token: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f' },
  ],
  sei: [
    { pool: '0x63EFdA4bf91Ba13D678C58AF47304e6180dD46DF', token: 'native' },
    { pool: '0x2B7995fd223dCf3A660Cc5a514349E3fa7B16168', token: '0x5Cf6826140C1C56Ff49C808A1A75407Cd1DF9423' },
    { pool: '0x213299AC40Ce76117C2c4B13945D9d935686BB85', token: '0x9151434b16b9763660705744891fA906F660EcC5' },
    { pool: '0x9A102080970043B96773c15E6520d182565C68Ff', token: '0x160345fc359604fc6e70e3c5facbde5f7a9342d8' },
    { pool: '0x7Cd4afD7F4DB51A0bF06Bf4630752A5B28e0B6C1', token: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c' },
  ],
  monad: [
    { pool: '0x10a4481F79aAC209aC6c2959B785F2e303912Dc5', token: 'native' },
    { pool: '0xdc887aCFe154BF0048Ae15Cda3693Ab2C237431A', token: '0x0555E30da8f98308EdB960aa94C0Db47230d2B9c' },
    { pool: '0xD7Ff49751DAF42Bf7AFC4fF5C958d4bea48358D3', token: '0xEE8c0E9f1BFFb4Eb878d8f15f368A02a35481242' },
    { pool: '0x5562d84f9891288fc72aaB1d857797c7275Fcedb', token: '0xA3227C5969757783154C60bF0bC1944180ed81B9' },
    { pool: '0x4fb4c3A33cBe855C5d87078c1BbBe5f371417faC', token: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a' },
    { pool: '0xd9D50D4F73f61A306b47e5BdC825E98cd11139dc', token: '0xe7cd86e13AC4309349F30B3435a9d337750fC82D' },
    { pool: '0x0b4e69C4890a88acA90E7e71dB76619C3AaCD79D', token: '0x8498312A6B3CbD158bf0c93AbdCF29E6e4F55081' },
    { pool: '0x398715A6011391B2B7fD1fF66BB26c126E5d4aAC', token: '0x1B68626dCa36c7fE922fD2d55E4f631d962dE19c' },
  ],
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const chain = options.chain
  const pools = HUB_POOLS[chain] ?? []

  const flat = pools.map((p) => ({
    pool: p.pool,
    priceKey: `${chain}:${p.token === 'native' ? WRAPPED_NATIVE[chain] : p.token}`,
  })).filter((f) => !f.priceKey.endsWith(':undefined'))

  const targets = flat.map((f) => f.pool)

  let avaxApi = options.fromApi as any
  if (chain !== CHAIN.AVAX) {
    avaxApi = new sdk.ChainApi({ chain: CHAIN.AVAX, timestamp: options.fromTimestamp })
    await avaxApi.getBlock()
  }

  const [variableData, stableData, feeData] = await Promise.all([
    avaxApi.multiCall({ abi: getVariableBorrowDataAbi, calls: targets, permitFailure: true }),
    avaxApi.multiCall({ abi: getStableBorrowDataAbi, calls: targets, permitFailure: true }),
    avaxApi.multiCall({ abi: getFeeDataAbi, calls: targets, permitFailure: true }),
  ])

  const dt = BigInt(options.toTimestamp - options.fromTimestamp)

  flat.forEach((f, i) => {
    const v = variableData[i]
    const s = stableData[i]
    const fee = feeData[i]
    if (!v || !s || !fee) {
      console.error(`folks-finance-xchain: pool read failed for ${f.pool} on ${chain}`)
      return
    }

    const variableDebt = BigInt(v[3])
    const variableRate = BigInt(v[4])
    const stableDebt = BigInt(s[8])
    const stableRate = BigInt(s[10])
    const retentionRate = BigInt(fee[1])

    const grossInterest =
      ((variableDebt * variableRate + stableDebt * stableRate) * dt) / (RATE_DP * SECONDS_PER_YEAR)
    if (grossInterest === 0n) return

    const protocolRevenue = (grossInterest * retentionRate) / RETENTION_DP
    const supplySideRevenue = grossInterest - protocolRevenue

    // skipChain: priceKey already contains chain prefix, prevent double-prepend
    dailyFees.add(f.priceKey, grossInterest.toString(), { label: 'Borrow Interest', skipChain: true })
    dailyProtocolRevenue.add(f.priceKey, protocolRevenue.toString(), { label: 'Borrow Interest To Treasury', skipChain: true })
    dailySupplySideRevenue.add(f.priceKey, supplySideRevenue.toString(), { label: 'Borrow Interest To Depositors', skipChain: true })
  })

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: 'Borrow interest paid across all xChain hub pools.',
  Revenue: 'Protocol share of borrow interest (retention rate per pool).',
  ProtocolRevenue: 'Retention rate portion sent to the protocol treasury.',
  SupplySideRevenue: 'Remaining borrow interest paid to depositors.',
}

const breakdownMethodology = {
  Fees: { 'Borrow Interest': 'Variable + stable borrow interest across all hub pools.' },
  Revenue: { 'Borrow Interest To Treasury': 'Protocol-retained portion of accrued borrow interest.' },
  ProtocolRevenue: { 'Borrow Interest To Treasury': 'Protocol-retained portion of accrued borrow interest.' },
  SupplySideRevenue: { 'Borrow Interest To Depositors': 'Non-retained borrow interest paid to depositors.' },
}

const CHAIN_START: Record<string, string> = {
  [CHAIN.AVAX]: '2024-10-03',
  [CHAIN.BASE]: '2024-10-03',
  [CHAIN.ETHEREUM]: '2024-10-03',
  [CHAIN.BSC]: '2024-10-15',
  [CHAIN.ARBITRUM]: '2024-11-05',
  [CHAIN.POLYGON]: '2025-03-05',
  [CHAIN.SEI]: '2025-07-15',
  [CHAIN.MONAD]: '2025-11-20',
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  adapter: Object.fromEntries(
    Object.entries(CHAIN_START).map(([chain, start]) => [chain, { fetch, start }])
  ),
}

export default adapter

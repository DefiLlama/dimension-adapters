import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from "../../helpers/chains";

// Overtime (formerly Thales) contract registry: https://v2.contracts.overtime.io/ (each entry redirects to the explorer page)
// Verified sources were read from the explorers; addresses below were resolved on 2026-09-28.

// OIP-265 ended public liquidity provision: https://github.com/thales-markets/overtime-improvement-proposals/blob/main/OIPs/OIP-265.md
// The last external LP balances were paid out (Claimed events) at the round closes of 2026-07-20 on every
// SportsAMMV2LiquidityPool. From the next rounds on, the Overtime treasury (0x1777c6d588fd931751762836811529c0073d6376)
// is the only depositor, so the pools' result belongs to the protocol.
export const TREASURY_ONLY_LIQUIDITY_START = 1784592000 // 2026-07-21T00:00:00Z

const OVER = {
  [CHAIN.OPTIMISM]: '0xedf38688b27036816a50185caa430d5479e1c63e',
  [CHAIN.ARBITRUM]: '0x5829d6fe7528bc8e92c4e81cc8f20a528820b51a',
  [CHAIN.BASE]: '0x7750c092e284e2c7366f50c8306f43c7eb2e82a2',
}

// legacy governance token, replaced by OVER (THALES pools stopped taking new rounds after the migration)
const THALES = {
  [CHAIN.OPTIMISM]: '0x217d47011b23bb961eb6d93ca9945b7501a5bb11',
  [CHAIN.ARBITRUM]: '0xe85b662fe97e8562f4099d8a1d5a92d4b453bf30',
}

export type CasinoV1Games = {
  dice: string // BetPlaced / BetResolved, getBetBase
  roulette: string // same BetResolved signature as Dice, getBetBase
  baccarat: string // own BetResolved signature, getBetBase
  blackjack: string // HandResolved, getHandBase + getSplitDetails
  slots: string // SpinResolved, getSpinBase
}

export type OvertimeChainConfig = {
  start: string
  sportsAMMV2?: string
  // SportsAMMV2LiquidityPool and its collateral. Only read before TREASURY_ONLY_LIQUIDITY_START (LP performance fee)
  liquidityPools?: { pool: string, collateral: string }[]
  freeBetsHolder: string
  // Roulette, Dice, Blackjack, Baccarat, Slots: each game holds its own treasury-funded bankroll
  casinoV1?: CasinoV1Games
  // CasinoCoreV2 holds the shared treasury bankroll of Plinko, Hi-Lo, Keno, Video Poker, Three Card Poker,
  // Ultimate/Bonus Hold'em and Penalty Shootout; every stake and payout of those games goes through it
  casinoCoreV2?: string
  speedMarketsAMM: string
  chainedSpeedMarketsAMM: string
  // legacy Thales digital options AMMs (ThalesAMM, RangedAMM), no trades since mid-2025, kept for history
  digitalOptionsAMMs?: string[]
  // buys back OVER (THALES before the migration) with USDC and burns it
  safeBoxBuyback?: string
}

export const chainConfig: Record<string, OvertimeChainConfig> = {
  [CHAIN.OPTIMISM]: {
    start: '2024-08-01',
    sportsAMMV2: '0xFb4e4811C7A811E098A556bD79B64c20b479E431',
    liquidityPools: [
      { pool: '0x0fe1044Fc8C05482102Db14368fE88791E9B8698', collateral: ADDRESSES.optimism.USDC_CIRCLE },
      { pool: '0x4f2822D4e60af7f9F70E7e45BC1941fe3461231e', collateral: ADDRESSES.optimism.WETH_1 },
      { pool: '0x59a7A8Ae9d58D69a69b6A24770EC771110647226', collateral: OVER[CHAIN.OPTIMISM] },
      { pool: '0xE59206b08cC96Da0818522C75eE3Fd4EBB7c0A47', collateral: THALES[CHAIN.OPTIMISM] },
    ],
    freeBetsHolder: '0x8D18e68563d53be97c2ED791CA4354911F16A54B',
    casinoV1: {
      dice: '0x278a57140870E8d697a2Bf7321fFd212c4243aDc',
      roulette: '0x4ab51a404e6D37141b08b872a3382406B227fEa7',
      baccarat: '0xf2680aA6A4D9E354A3C65DF035552A7f708Ba0cA',
      blackjack: '0xf8c6314408BF0D9B0F790b1Ff88FDF4b29097AF2',
      slots: '0xeC5757736E10500cC243a1B43a41bb973717298e',
    },
    casinoCoreV2: '0x4BACE3b2BC955C11166e35673c71Be1593b42F80',
    speedMarketsAMM: '0xE16B8a01490835EC1e76bAbbB3Cadd8921b32001',
    chainedSpeedMarketsAMM: '0xFf8Cf5ABF583D0979C0B9c35d62dd1fD52cce7C7',
    digitalOptionsAMMs: ['0x9Ce94cdf8eCd57cec0835767528DC88628891dd9', '0xEd59dCA9c272FbC0ca4637F32ab32CBDB62E856B'],
    safeBoxBuyback: '0x679C0174f6c288C4bcd5C95C9Ec99D50357C59E7',
  },
  [CHAIN.ARBITRUM]: {
    start: '2024-08-01',
    sportsAMMV2: '0xfb64E79A562F7250131cf528242CEB10fDC82395',
    liquidityPools: [
      { pool: '0x22D180F39A0eB66098cf839AF5e3C6b009383B6A', collateral: ADDRESSES.arbitrum.USDC_CIRCLE },
      { pool: '0xcB4728a1789B87E05c813B68DBc5E6A98a4856bA', collateral: ADDRESSES.arbitrum.WETH },
      { pool: '0xc5f5186b46c84bF63a9e166bfa2175D9bc391ce2', collateral: OVER[CHAIN.ARBITRUM] },
      { pool: '0xbD08D8F8c17C22fb0a12Fe490F38f40c59B60d2A', collateral: ADDRESSES.arbitrum.WBTC },
      { pool: '0x9733AB157f5A89f0AD7460d08F869956aE2018dA', collateral: THALES[CHAIN.ARBITRUM] },
    ],
    freeBetsHolder: '0xd1F2b87a9521315337855A132e5721cfe272BBd9',
    casinoV1: {
      dice: '0xB444b352c3f070Bc4419EC732B5555847F477ab2',
      roulette: '0xc9DF7fe74ff692D3c4D8259b9aD42f17a93E022b',
      baccarat: '0x94f1834c60504D6EF01A74D8b7605ef61ac21C9d',
      blackjack: '0x15EC8D1DFe47a2C4818dFDE8db2738aF48D26012',
      slots: '0x0bE99020775d3a13c7649ee04a496BCc045d0Ea6',
    },
    casinoCoreV2: '0xA9d5789824aBc53d52224BA6D4eF6d41E99d8699',
    speedMarketsAMM: '0x02D0123a89Ae6ef27419d5EBb158d1ED4Cf24FA3',
    chainedSpeedMarketsAMM: '0xe92B4c614b04c239d30c31A7ea1290AdDCb8217D',
    digitalOptionsAMMs: ['0x2b89275efB9509c33d9AD92A4586bdf8c4d21505', '0x5cf3b1882357BB66Cf3cd2c85b81AbBc85553962'],
  },
  [CHAIN.BASE]: {
    start: '2024-08-01',
    sportsAMMV2: '0x76923cDDE21928ddbeC4B8BFDC8143BB6d0841a8',
    liquidityPools: [
      { pool: '0xf86e90412F52fDad8aD8D1aa2dA5B2C9a7e5f018', collateral: ADDRESSES.base.USDC },
      { pool: '0xcc4ED8cD7101B512B134360ED3cCB759caB33f17', collateral: ADDRESSES.base.WETH },
      { pool: '0xB4199DC163F3206643649E117A816ad0DECb6C3B', collateral: OVER[CHAIN.BASE] },
      { pool: '0x8d4f838327DedFc735e202731358AcFc260c207a', collateral: ADDRESSES.base.cbBTC },
    ],
    freeBetsHolder: '0x2929Cf1edAc2DB91F68e2822CEc25736cAe029bf',
    casinoV1: {
      dice: '0x2C1443084574a3Bd3D61c00aD7fc504eD3703eC2',
      roulette: '0x18A852273002Cc23264B4B0D7EEd7A171509fc63',
      baccarat: '0x1e20B82a849DA8797B775B4f3C97119d67198DC4',
      blackjack: '0x1500b398AD5F6a0AdA60D1f2b433126bBFE9B0FC',
      slots: '0x8B09Fc184eE075270244ad33FEF2B153e37911A0',
    },
    casinoCoreV2: '0xab487C74Bd9fb88Cea5D39F25C6a15C4A7734055',
    speedMarketsAMM: '0x85b827d133FEDC36B844b20f4a198dA583B25BAA',
    chainedSpeedMarketsAMM: '0x6848F001ddDb4442d352C495c7B4a231e3889b70',
    safeBoxBuyback: '0xd5679539c29eEBe69347acE5DEef867b19dba7b7', // deployed 2025-01, no BuybackExecuted yet as of 2026-09-28
  },
  [CHAIN.POLYGON]: {
    start: '2024-08-01', // Speed Markets only; positions on these AMMs date back to 2023, same start as the other chains
    freeBetsHolder: '0xcB4728a1789B87E05c813B68DBc5E6A98a4856bA',
    speedMarketsAMM: '0x4B1aED25f1877E1E9fBECBd77EeE95BB1679c361',
    chainedSpeedMarketsAMM: '0x14D2d7f64D6F10f8eF06372c2e5E36850661a537',
  },
};

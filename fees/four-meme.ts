import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

// Classic four.meme (TokenManager V1 and V2): the 1% trade fee and the launch fees leave the TokenManagers as BNB into the
// fee Safes (SafeReceived) or as ERC-20 transfers into the Safes and the rev-share wallet.
const TOKEN_MANAGERS = [
  '0xec4549cadce5da21df6e6422d448034b5233bfbc', // TokenManager V1
  '0x5c952063c7fc8610ffdb798152d69f0b9550762b', // TokenManager2
]
// Fee Safes, source: https://dune.com/queries/4068894/6851717 plus the wallets added in #4659 and #9739
const FEE_SAFES = [
  '0x48735904455eda3aa9a0c9e43ee9999c795e30b9',
  '0x55d571b7475f4382c2a15d24a7c864ca679407c4',
  '0x60be34554f193f4f6862b0e12dc16ba30163d6d0',
  '0x31120f443365efa63330d2d962f537ae28f0d672',
  '0xf89b36b36a634745eefbbf17d5f777a494f8b6f7',
  '0xc1865a53609eaec415b530632f43f4297392b224',
  '0xaac9b5c6bc7d8be29a4021138f8a0b29e557ff90',
  '0xbb389e252bdf9d55332d217d9fe06bed43b23c2f',
  '0xc1d73ed52f810db8a2c1a5785c5b743f1996dbb4',
  '0x15eb4cbc2c53bf6cdbe49711e8b2e97d2712439a',
  '0xb5afc2f8836682afd5a711ad555e7fd55ec38a20',
  '0x060aeca503f7383fe8fba8c9659ee0b8bf637077',
  '0x0232fca3f2e8bb567e851151c396ceb3d0d47c11',
  '0x821cfb3921bae561fbf9527fdc5a4285468740aa',
  '0xb10c5381fc00bc8296016ec21b7e29a852414c48',
]
// Rev-share wallet: receives a share of classic ERC-20 fees and 5% of every OpenFour protocol fee (FeeAssigned kind 6).
// It is an EOA, so its BNB inflows emit no log and are not counted.
const REBATE_WALLET = '0x2b6e6e4def77583229299cf386438a227e683b28'
const SAFE_RECEIVED = 'event SafeReceived(address indexed sender, uint256 value)'

// OpenFour, the launch engine introduced by Four.Meme (https://github.com/four-meme-community/openfour-docs, integration guide §13).
// FeeRouter 0x7383.. emits FeeAssigned for every fee it routes, in the trade's quote token: kind 1 (trade protocol fee after
// the rebate) and kind 4 (protocol share of migration fees) go to the OpenFour treasury 0x7cf6b1c47b4a199a4af6da22726c2c8bfa64a3f1,
// kind 6 is the 5% rebate to the rev-share wallet, kind 5 the creator's share of migration fees, kind 7 a partner share held as a
// claimable balance, kind 3 the token tax paid to the token itself (not a fee). Treasury transfers match kinds 1 and 4 one-to-one.
// Sample tx 0x2c906e792ae2c6ad84efbfe23212d8a5fb335a20720ac95a96ace695172ba6d3: trade fee 1.506 BNC4, 1.431 to treasury, 0.075 to rebate wallet.
// Sample tx 0x982e1f1dafe3b3b6ae122fd6205783b01e34abb7b5dea28df0bbb93e6d6144da: migration fee 0.242 WBNB, 0.121 to treasury, 0.121 to the creator.
// Developer fees and the anti-sniper surcharge on early buys are only in TradeExecuted (guide §10.2): developer fees accrue to the
// preset author as a claimable balance, the anti-sniper fee is kept by the vault for its migration buyback. Both are booked when charged.
const OPENFOUR_CORE = '0xebe7b6c1089d9f72ad07f34e36d898e44e5e27f3'
const OPENFOUR_FEE_ROUTER = '0x7383b244b416db16aa9dd0ab7c296aa60255b9a2'
const FEE_ASSIGNED = 'event FeeAssigned(address indexed token, address indexed quoteAsset, address recipient, uint8 indexed kind, uint256 amount, bool pending)'
const TRADE_EXECUTED = 'event TradeExecuted(address indexed token, address indexed trader, uint256 indexed presetId, bool isBuy, address quoteAsset, address vault, uint256 requestedTokenAmount, uint256 tokenAmount, uint256 curveQuoteAmount, uint256 traderQuoteAmount, uint256 lastPrice, uint256 slippageLimit, uint256 protocolFee, uint256 taxFee, uint256 devFee, uint256 antiSniperFee, uint256 totalRaised, uint256 remainingForSale)'
// Presets authored by four.meme itself, per the template API (POST https://four.meme/meme-api/v1/public/token_template/search,
// userAddress 0xc91de6.. and 0x582df7..): OPEN_FOUR_TOKEN, Likwid Dex, RWA, ListaYield, 4STOCK ("introduced by Four.Meme"),
// Binance Agent ID Exclusive. Their developer fee accrues to four.meme, so it is revenue; other presets pay third-party developers.
const FOUR_MEME_PRESETS = new Set(['1778027615722', '1778027615725', '1778027615726', '1778027615732', '1778027615733', '1778027615735'])
const FOUR_MEME_PRESET_DEV_FEES = 'Four.meme Preset Developer Fees'

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // classic BNB fees: SafeReceived on the fee Safes, sent by the TokenManagers
  const safeLogs = await options.getLogs({ targets: FEE_SAFES, eventAbi: SAFE_RECEIVED })
  safeLogs.forEach((log: any) => {
    if (!TOKEN_MANAGERS.includes(log.sender.toLowerCase())) return
    dailyFees.addGasToken(log.value, METRIC.TRADING_FEES)
    dailyRevenue.addGasToken(log.value, METRIC.PROTOCOL_FEES)
  })

  // classic ERC-20 fees: transfers from the TokenManagers to the Safes (kept) and to the rev-share wallet (rebate)
  const safeTokens = await addTokensReceived({ options, targets: FEE_SAFES, fromAdddesses: TOKEN_MANAGERS })
  dailyFees.addBalances(safeTokens, { label: METRIC.TRADING_FEES })
  dailyRevenue.addBalances(safeTokens, { label: METRIC.PROTOCOL_FEES })
  const rebateTokens = await addTokensReceived({ options, target: REBATE_WALLET, fromAdddesses: TOKEN_MANAGERS })
  dailyFees.addBalances(rebateTokens, { label: METRIC.TRADING_FEES })
  dailySupplySideRevenue.addBalances(rebateTokens, { label: 'Rebates' })

  // OpenFour routed fees
  const feeLogs = await options.getLogs({ target: OPENFOUR_FEE_ROUTER, eventAbi: FEE_ASSIGNED })
  feeLogs.forEach((log: any) => {
    const kind = Number(log.kind)
    if (kind === 1 || kind === 4) {
      dailyFees.add(log.quoteAsset, log.amount, METRIC.TRADING_FEES)
      dailyRevenue.add(log.quoteAsset, log.amount, METRIC.PROTOCOL_FEES)
    } else if (kind === 6) {
      dailyFees.add(log.quoteAsset, log.amount, METRIC.TRADING_FEES)
      dailySupplySideRevenue.add(log.quoteAsset, log.amount, 'Rebates')
    } else if (kind === 5) {
      dailyFees.add(log.quoteAsset, log.amount, METRIC.CREATOR_FEES)
      dailySupplySideRevenue.add(log.quoteAsset, log.amount, METRIC.CREATOR_FEES)
    } else if (kind === 7) {
      dailyFees.add(log.quoteAsset, log.amount, 'Partner Fees')
      dailySupplySideRevenue.add(log.quoteAsset, log.amount, 'Partner Fees')
    }
  })

  // OpenFour developer and anti-sniper fees
  const trades = await options.getLogs({ target: OPENFOUR_CORE, eventAbi: TRADE_EXECUTED })
  trades.forEach((log: any) => {
    if (log.devFee > 0n) {
      if (FOUR_MEME_PRESETS.has(String(log.presetId))) {
        dailyFees.add(log.quoteAsset, log.devFee, FOUR_MEME_PRESET_DEV_FEES)
        dailyRevenue.add(log.quoteAsset, log.devFee, FOUR_MEME_PRESET_DEV_FEES)
      } else {
        dailyFees.add(log.quoteAsset, log.devFee, 'Developer Fees')
        dailySupplySideRevenue.add(log.quoteAsset, log.devFee, 'Developer Fees')
      }
    }
    if (log.antiSniperFee > 0n) {
      dailyFees.add(log.quoteAsset, log.antiSniperFee, 'Anti-Sniper Fees')
      dailySupplySideRevenue.add(log.quoteAsset, log.antiSniperFee, 'Anti-Sniper Fees')
    }
  })

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BSC],
  start: '2024-12-25',
  pullHourly: true,
  methodology: {
    Fees: "Trade, launch and migration fees paid by users on four.meme's bonding curves, classic and OpenFour. Token taxes are excluded.",
    Revenue: "The share of those fees four.meme keeps: its treasury cut plus developer fees on the OpenFour presets it wrote itself.",
    ProtocolRevenue: "The share of those fees four.meme keeps: its treasury cut plus developer fees on the OpenFour presets it wrote itself.",
    SupplySideRevenue: "The share paid to others: the 5% rev-share rebate, third-party preset developers, partners, token creators and the anti-sniper buyback.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "Trade, launch and migration fees collected by four.meme, including the rev-share rebate",
      [FOUR_MEME_PRESET_DEV_FEES]: "Developer fees on OpenFour presets written by four.meme",
      'Developer Fees': "Developer fees on OpenFour presets written by third parties",
      'Partner Fees': "Partner share of OpenFour protocol fees",
      [METRIC.CREATOR_FEES]: "Token creator's share of OpenFour migration fees",
      'Anti-Sniper Fees': "Surcharge on early OpenFour buys, kept by the vault for the migration buyback",
    },
    Revenue: {
      [METRIC.PROTOCOL_FEES]: "Fees kept by four.meme after the rev-share rebate",
      [FOUR_MEME_PRESET_DEV_FEES]: "Developer fees on OpenFour presets written by four.meme",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_FEES]: "Fees kept by four.meme after the rev-share rebate",
      [FOUR_MEME_PRESET_DEV_FEES]: "Developer fees on OpenFour presets written by four.meme",
    },
    SupplySideRevenue: {
      'Rebates': "5% of protocol fees sent to the rev-share wallet",
      'Developer Fees': "Developer fees on OpenFour presets written by third parties",
      'Partner Fees': "Partner share of OpenFour protocol fees",
      [METRIC.CREATOR_FEES]: "Token creator's share of OpenFour migration fees",
      'Anti-Sniper Fees': "Surcharge on early OpenFour buys, kept by the vault for the migration buyback",
    },
  },
};
export default adapter;


import { BaseAdapter, FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

const config: any = {
  [CHAIN.CORE]: '0xbEF63121a00916d88c4558F2a92f7d931C67115B',
  [CHAIN.SONIC]: '0xbEF63121a00916d88c4558F2a92f7d931C67115B',
  [CHAIN.SOPHON]: '0x66Ae13488b281C0aCf731b8D7970E069b673df00',
  [CHAIN.MORPH]: '0x045AF95cAAbB5971183C411aBd7c81F2E122706D',
  [CHAIN.CELO]: '0x797357F76042D76523848eF9ABb5e2e5c1aF1655',
  [CHAIN.SONEIUM]: '0x1C0F98d9fE946d42f44196C439256BcfEe80B056',
  [CHAIN.SCROLL]: '0x809c2C530c35Dd0a8877e1EEf139fd60d9b811Eb',
  [CHAIN.LINEA]: '0xA74e55412Ffb46747dd45eeFdb68BF1366205036',
  [CHAIN.TAIKO]: '0x95e483Ce4acf1F24B6cBD8B369E0735a3e56f5BB',
}

const abi = {
  "TokenCreated": "event TokenCreated(address indexed tokenAddress, address indexed creator, string name, string symbol, (string imageUrl, string description, string twitterUrl, string telegramUrl, string youtubeUrl, string websiteUrl) metadata, uint256 creationFee, uint256 occuredAt)",
  "TokenPurchased": "event TokenPurchased(address indexed tokenAddress, address indexed buyer, uint256 amount, uint256 totalPrice, uint256 fee, (uint256 funding, uint256 supply, uint256 marketCap) tokenState, uint256 occuredAt)",
  "TokenSold": "event TokenSold(address indexed tokenAddress, address indexed seller, uint256 amount, uint256 totalPrice, uint256 fee, (uint256 funding, uint256 supply, uint256 marketCap) tokenState, uint256 occuredAt)",
  "tokenCreatorFeePercent": "uint256:tokenCreatorFeePercent",
}

async function fetch({ chain, createBalances, api, getLogs }: FetchOptions) {
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailyVolume = createBalances()

  const creatorFees = (await api.call({ abi: abi.tokenCreatorFeePercent, target: config[chain] })) / 100

  const creationLogs = await getLogs({ target: config[chain], eventAbi: abi.TokenCreated, })
  const purchaseLogs = await getLogs({ target: config[chain], eventAbi: abi.TokenPurchased, })
  const saleLogs = await getLogs({ target: config[chain], eventAbi: abi.TokenSold, })

  creationLogs.forEach(log => {
    dailyFees.addGasToken(log.creationFee)
    dailyRevenue.addGasToken(log.creationFee)
  })

  purchaseLogs.concat(saleLogs).forEach(log => {
    dailyFees.addGasToken(log.fee)
    dailyRevenue.addGasToken(log.fee * (1 - creatorFees))
    dailyVolume.addGasToken(log.totalPrice)
  })

  return { dailyFees, dailyRevenue, dailyVolume, dailyProtocolRevenue: dailyRevenue }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {}
}

Object.keys(config).forEach(chain => (adapter.adapter as BaseAdapter)[chain] = { fetch })

export default adapter
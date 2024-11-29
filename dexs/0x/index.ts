import { BreakdownAdapter, FetchV2, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// https://0x.org/docs/introduction/0x-cheat-sheet
const config = {
  ethereum: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  polygon: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  bsc: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  optimism: { exchange: '0xdef1abe32c034e558cdd535791643c58a13acc10' },
  fantom: { exchange: '0xdef189deaef76e379df891899eb5a00a94cbc250' },
  celo: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  [CHAIN.AVAX]: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  arbitrum: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
  base: { exchange: '0xdef1c0ded9bec7f1a1670819833240f027b25eff' },
} as { [chain: string]: { exchange: string } }

// https://github.com/0xProject/protocol/blob/development/packages/contract-artifacts/artifacts/IZeroEx.json
const abi = {
  "ERC1155OrderCancelled": "event ERC1155OrderCancelled(address maker, uint256 nonce)",
  "ERC1155OrderFilled": "event ERC1155OrderFilled(uint8 direction, address maker, address taker, uint256 nonce, address erc20Token, uint256 erc20FillAmount, address erc1155Token, uint256 erc1155TokenId, uint128 erc1155FillAmount, address matcher)",
  "ERC1155OrderPreSigned": "event ERC1155OrderPreSigned(uint8 direction, address maker, address taker, uint256 expiry, uint256 nonce, address erc20Token, uint256 erc20TokenAmount, (address recipient, uint256 amount, bytes feeData)[] fees, address erc1155Token, uint256 erc1155TokenId, (address propertyValidator, bytes propertyData)[] erc1155TokenProperties, uint128 erc1155TokenAmount)",
  "ERC721OrderCancelled": "event ERC721OrderCancelled(address maker, uint256 nonce)",
  "ERC721OrderFilled": "event ERC721OrderFilled(uint8 direction, address maker, address taker, uint256 nonce, address erc20Token, uint256 erc20TokenAmount, address erc721Token, uint256 erc721TokenId, address matcher)",
  "ERC721OrderPreSigned": "event ERC721OrderPreSigned(uint8 direction, address maker, address taker, uint256 expiry, uint256 nonce, address erc20Token, uint256 erc20TokenAmount, (address recipient, uint256 amount, bytes feeData)[] fees, address erc721Token, uint256 erc721TokenId, (address propertyValidator, bytes propertyData)[] erc721TokenProperties)",
  "LimitOrderFilled": "event LimitOrderFilled(bytes32 orderHash, address maker, address taker, address feeRecipient, address makerToken, address takerToken, uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount, uint128 takerTokenFeeFilledAmount, uint256 protocolFeePaid, bytes32 pool)",
  "LiquidityProviderSwap": "event LiquidityProviderSwap(address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount, address provider, address recipient)",
  "MetaTransactionExecuted": "event MetaTransactionExecuted(bytes32 hash, bytes4 indexed selector, address signer, address sender)",
  "Migrated": "event Migrated(address caller, address migrator, address newOwner)",
  "OrderCancelled": "event OrderCancelled(bytes32 orderHash, address maker)",
  "OrderSignerRegistered": "event OrderSignerRegistered(address maker, address signer, bool allowed)",
  "OtcOrderFilled": "event OtcOrderFilled(bytes32 orderHash, address maker, address taker, address makerToken, address takerToken, uint128 makerTokenFilledAmount, uint128 takerTokenFilledAmount)",
  "OwnershipTransferred": "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "PairCancelledLimitOrders": "event PairCancelledLimitOrders(address maker, address makerToken, address takerToken, uint256 minValidSalt)",
  "PairCancelledRfqOrders": "event PairCancelledRfqOrders(address maker, address makerToken, address takerToken, uint256 minValidSalt)",
  "ProxyFunctionUpdated": "event ProxyFunctionUpdated(bytes4 indexed selector, address oldImpl, address newImpl)",
  "QuoteSignerUpdated": "event QuoteSignerUpdated(address quoteSigner)",
  "RfqOrderFilled": "event RfqOrderFilled(bytes32 orderHash, address maker, address taker, address makerToken, address takerToken, uint128 takerTokenFilledAmount, uint128 makerTokenFilledAmount, bytes32 pool)",
  "RfqOrderOriginsAllowed": "event RfqOrderOriginsAllowed(address origin, address[] addrs, bool allowed)",
  "TransformedERC20": "event TransformedERC20(address indexed taker, address inputToken, address outputToken, uint256 inputTokenAmount, uint256 outputTokenAmount)",
  "TransformerDeployerUpdated": "event TransformerDeployerUpdated(address transformerDeployer)",
}

const fetchRFQ: FetchV2 = async ({ getLogs, chain, createBalances, }) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: config[chain].exchange, eventAbi: abi.RfqOrderFilled, })
  logs.forEach(log => dailyVolume.add(log.makerToken, log.makerTokenFilledAmount))
  return { dailyVolume }
}
const fetchOTC: FetchV2 = async ({ getLogs, chain, createBalances, }) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: config[chain].exchange, eventAbi: abi.OtcOrderFilled, })
  logs.forEach(log => dailyVolume.add(log.makerToken, log.makerTokenFilledAmount))
  return { dailyVolume }
}
const fetchERC1155: FetchV2 = async ({ getLogs, chain, createBalances, }) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: config[chain].exchange, eventAbi: abi.ERC1155OrderFilled, })
  logs.forEach(log => dailyVolume.add(log.erc20Token, log.erc20FillAmount))
  return { dailyVolume }
}
const fetchERC721: FetchV2 = async ({ getLogs, chain, createBalances, }) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: config[chain].exchange, eventAbi: abi.ERC721OrderFilled, })
  logs.forEach(log => dailyVolume.add(log.erc20Token, log.erc20TokenAmount))
  return { dailyVolume }
}
const fetchERCLimit: FetchV2 = async ({ getLogs, chain, createBalances, }) => {
  const dailyVolume = createBalances()
  const logs = await getLogs({ target: config[chain].exchange, eventAbi: abi.LimitOrderFilled, })
  logs.forEach(log => dailyVolume.add(log.makerToken, log.makerTokenFilledAmount))
  return { dailyVolume }
}

const adaptersRFQ: any = {}
const adaptersOTC: any = {}
const adaptersERC1155: any = {}
const adaptersERC721: any = {}
const adaptersERCLimit: any = {}
Object.keys(config).forEach(chain => {
  adaptersRFQ[chain] = { fetch: fetchRFQ }
  adaptersOTC[chain] = { fetch: fetchOTC }
  adaptersERC1155[chain] = { fetch: fetchERC1155 }
  adaptersERC721[chain] = { fetch: fetchERC721 }
  adaptersERCLimit[chain] = { fetch: fetchERCLimit }
})

const adapter: BreakdownAdapter = {
  breakdown: {
    "0x RFQ": adaptersRFQ,
    "0x OTC": adaptersOTC,
    // "0x ERC1155": adaptersERC1155,
    // "0x ERC721": adaptersERC721,
    "0x Limit": adaptersERCLimit,
  },
  version: 2
}

export default adapter;

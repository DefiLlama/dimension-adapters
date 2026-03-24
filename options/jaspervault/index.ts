import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from '../../helpers/coreAssets.json'
import { Chain } from "../../adapters/types";

const iBTC_arbitrum = '0x050C24dBf1eEc17babE5fc585F06116A259CC77A'
const WSOL_arbitrum = '0x2bcC6D6CdBbDC0a4071e48bb3B969b06B3330c07'
const UNI_arbitrum = '0xFa7F8980b0f1E64A2062791cc3b0871572f1F7f0'
const cbBTC_base = ADDRESSES.ethereum.cbBTC
const USDT_btr = '0xfe9f969faf8ad72a83b761138bf25de87eff9dd2'
const btr_btc = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const btr_wbtc = ADDRESSES.btr.WBTC

type TokenContracts = {
  [key in Chain]: string[][];
};

const contracts: TokenContracts = {
  [CHAIN.ARBITRUM]: [
    [ADDRESSES.arbitrum.WETH],
    [ADDRESSES.arbitrum.WBTC],
    [ADDRESSES.arbitrum.USDC],
    [ADDRESSES.arbitrum.USDT],
    [ADDRESSES.arbitrum.ARB],
    [ADDRESSES.arbitrum.LINK],
    [UNI_arbitrum],
    [WSOL_arbitrum],
    [iBTC_arbitrum]
  ],
  [CHAIN.BASE]: [
    [ADDRESSES.base.USDC],
    [cbBTC_base],
  ],
  [CHAIN.BITLAYER]: [
    [USDT_btr],
    [btr_wbtc]
  ],
}
let tokenDecimals: any = {}
function getDecimals(token_address: string) {
  token_address = token_address.toLowerCase()
  if (token_address == ADDRESSES.GAS_TOKEN_2)
    return 18

  if (tokenDecimals[token_address])
    return tokenDecimals[token_address]
  return 0;
}

const optionModules: Record<string, string[]> = {
    [CHAIN.ARBITRUM]: ["0xCFE9340CF648Ff7623e6c7B1C7fE2f902F390612", "0xD364261EB9ee191faD71f635896328194EA7a488"],
    [CHAIN.BASE]: ["0x601f86b3e1979a59095c3A994c128db69AF3A00B", "0x79b8A9916d520361629EE66cb889F0dcC5fF5A0F"],
    [CHAIN.BITLAYER]: ["0xecb1233e463aa6cf6ac0970d5643935a929ffad9", "0x65ec8711814a1b2b48f4fddbf2c391c3d7e05764"]
}

const premiumSignStruct = "(uint256 id,uint256 chainId,uint64 productType,address optionAsset,uint256 strikePrice,address strikeAsset,uint256 strikeAmount,address lockAsset,uint256 lockAmount,uint256 expireDate,uint256 lockDate,uint8 optionType,address premiumAsset,uint256 premiumFee,uint256 timestamp,bytes[] oracleSign)"
const managedOrderStruct = `(address holder,address writer,address recipient,uint256 quantity,uint256 settingsIndex,uint256 productTypeIndex,uint256 oracleIndex,address nftFreeOption,${premiumSignStruct} premiumSign,uint8 optionSourceType,bool liquidationToEOA,uint256 offerID)`
const optionPremiumEvent = `event OptionPremiun(uint64 _orderID,${managedOrderStruct} _info,uint256 _premiumAmount,uint256 _freePremiumAmount)`

async function fetch(options: FetchOptions) {
  const dailyNotionalVolume = options.createBalances()
  const dailyPremiumVolume = options.createBalances()
  const tokens = contracts[options.chain].map(i => i[0]);
  let decimals = await options.api.multiCall({ abi: 'erc20:decimals', calls: tokens, });
  tokens.map((token, index) => {
    tokenDecimals[token.toLowerCase()] = decimals[index];
  });
  const logs = await options.getLogs({
    targets: optionModules[options.chain],
    eventAbi: optionPremiumEvent
  })
  logs.forEach(log => {
    const optionAsset = log._info.premiumSign.optionAsset.toLowerCase() === btr_btc ? btr_wbtc : log._info.premiumSign.optionAsset
    const premiumAsset = log._info.premiumSign.premiumAsset.toLowerCase() === btr_btc ? btr_wbtc : log._info.premiumSign.premiumAsset
    const decimalsOptionAsset = getDecimals(optionAsset);
    dailyNotionalVolume.add(optionAsset, (Number(log._info.quantity) / 1e18) * 10**decimalsOptionAsset)
    dailyPremiumVolume.add(premiumAsset, Number(log._premiumAmount))
  })
  return {
    dailyNotionalVolume,
    dailyPremiumVolume
  }
}

const adapter : SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: "2024-05-08"
    },
    [CHAIN.BASE]: {
      start: "2025-08-07"
    },
    [CHAIN.BITLAYER]: {
      start: "2025-08-07"
    }
  }
}

export default adapter
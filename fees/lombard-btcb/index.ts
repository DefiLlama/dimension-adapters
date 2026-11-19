import { ethers } from 'ethers'
import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'

/**
 * Lombard BTC.b: https://docs.lombard.finance/use/btcb
 *
 * All BTC.b fees are paid in BTC.b to the token's treasury (getTreasury()):
 * - redeemForBtc, through Lombard's AssetRouter (getAssetRouter(), 0x9eCe5fB1aB62d9075c4ec814b321e24D8EA021ac on every chain):
 *   tokenConfig(token).redeemFee + toNativeCommission(token) is minted to the treasury and amount + fee is burned from the user.
 *   No fee event; 10000 sats (0.0001 BTC.b) on every chain so far.
 *   e.g. https://etherscan.io/tx/0x3cf4ce076b348e6671368b64bdb392cdb10bbc0a2e8b869757d73503f79ee0f7
 * - AssetRouter mintWithFee (Lombard claims a BTC deposit for the user): the user-signed commission is burned from the
 *   recipient and minted to the treasury, emits AssetRouter_FeeCharged(fee).
 *   e.g. https://etherscan.io/tx/0x243a286cca82ea4b384f43c60b9e7946dd899198ddd3b567f9bfeb7a4b02bb6d
 * - token mintV1WithFee: same commission, transferred from the recipient to the treasury, emits FeeCharged(fee) on the token.
 *   e.g. https://etherscan.io/tx/0x5b4327f431ed82369011e3f1bac2cb4d7dbe8bb99c4ef94f368822294c730663
 * Deposit fees (AssetRouter_DepositFeeCharged / DepositFeeCharged) are 0 on every chain and have never been charged (checked 2026-11).
 *
 * The AssetRouter is shared with LBTC and AssetRouter_FeeCharged carries no token, so it is matched to BTC.b treasury
 * mints by tx hash and amount. Treasury mints that match no fee (a deposit or bridge to the treasury) are not counted.
 */

const TRANSFER_EVENT = 'event Transfer(address indexed from, address indexed to, uint256 value)'
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const TOKEN_FEE_CHARGED_EVENT = 'event FeeCharged(uint256 indexed fee, bytes userSignature)'
const ROUTER_FEE_CHARGED_EVENT = 'event AssetRouter_FeeCharged(uint256 indexed fee, bytes userSignature)'
const GET_ASSET_ROUTER_ABI = 'function getAssetRouter() view returns (address)'
const GET_TREASURY_ABI = 'function getTreasury() view returns (address)'
const TOKEN_CONFIG_ABI = 'function tokenConfig(address token) view returns (uint256 redeemFee, uint256 redeemForBtcMinAmount, bool isRedeemEnabled)'
const TO_NATIVE_COMMISSION_ABI = 'function toNativeCommission(address token) view returns (uint64)'

const LABELS = {
  REDEMPTION_FEES: 'BTC Redemption Fees',
  MINT_FEES: 'Mint Fees',
}

// lombardToken: the Lombard contract registered in the AssetRouter, when it differs from the ERC20 that emits the transfers
const chainConfig: Record<string, { token: string; lombardToken?: string; start: string }> = {
  [CHAIN.ETHEREUM]: { token: ADDRESSES.ethereum.BTC_b, start: '2025-11-20' },
  [CHAIN.AVAX]: { token: ADDRESSES.avax.BTC_b, lombardToken: '0x85d1d52e11290f174444d21c2a167bedbe36e4d2', start: '2026-01-28' },
  [CHAIN.MEGAETH]: { token: ADDRESSES.megaeth.BTC_b, start: '2025-12-01' },
  [CHAIN.MONAD]: { token: ADDRESSES.monad.BTC_b, start: '2025-11-20' },
  [CHAIN.STABLE]: { token: ADDRESSES.stable.BTC_b, start: '2025-11-26' },
  [CHAIN.KATANA]: { token: ADDRESSES.katana.BTC_b, start: '2025-07-29' },
}

const fetch = async (options: FetchOptions) => {
  const { token, lombardToken = token } = chainConfig[options.chain]
  const dailyFees = options.createBalances()

  const tokenFeeLogs = await options.getLogs({ target: lombardToken, eventAbi: TOKEN_FEE_CHARGED_EVENT })
  tokenFeeLogs.forEach((log: any) => dailyFees.add(token, log.fee, LABELS.MINT_FEES))

  const treasury: string = await options.api.call({ target: lombardToken, abi: GET_TREASURY_ABI })
  const treasuryMints = await options.getLogs({
    target: token,
    eventAbi: TRANSFER_EVENT,
    topics: [TRANSFER_TOPIC, ethers.zeroPadValue(ethers.ZeroAddress, 32), ethers.zeroPadValue(treasury, 32)],
    onlyArgs: false,
  })

  if (treasuryMints.length) {
    const assetRouter: string = await options.api.call({ target: lombardToken, abi: GET_ASSET_ROUTER_ABI })
    const { redeemFee } = await options.api.call({ target: assetRouter, abi: TOKEN_CONFIG_ABI, params: [lombardToken] })
    const toNativeCommission = await options.api.call({ target: assetRouter, abi: TO_NATIVE_COMMISSION_ABI, params: [lombardToken] })
    const redemptionFees = [BigInt(redeemFee) + BigInt(toNativeCommission), BigInt(redeemFee)].filter((fee) => fee > 0n)

    const routerFeeLogs = await options.getLogs({ target: assetRouter, eventAbi: ROUTER_FEE_CHARGED_EVENT, onlyArgs: false })
    const routerFeeKeys = routerFeeLogs.map((log: any) => `${log.transactionHash.toLowerCase()}-${log.args.fee}`)

    for (const log of treasuryMints) {
      const value = BigInt(log.args.value)
      const index = routerFeeKeys.indexOf(`${log.transactionHash.toLowerCase()}-${value}`)
      if (index >= 0) {
        routerFeeKeys.splice(index, 1)
        dailyFees.add(token, value, LABELS.MINT_FEES)
      } else if (redemptionFees.includes(value)) {
        dailyFees.add(token, value, LABELS.REDEMPTION_FEES)
      }
    }
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(),
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Fees: 'Fees paid by users to redeem BTC.b for BTC (0.0001 BTC.b per redemption) and commissions paid when Lombard claims a BTC deposit on the user\'s behalf. Bridging BTC.b between chains has no Lombard fee.',
    UserFees: 'BTC.b redemption fees and deposit-claim commissions paid by users.',
    Revenue: 'All BTC.b redemption fees and deposit-claim commissions, kept by Lombard.',
    ProtocolRevenue: 'All BTC.b redemption fees and deposit-claim commissions, sent to the Lombard treasury.',
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.REDEMPTION_FEES]: 'Fixed fee (0.0001 BTC.b) charged on each BTC.b redemption for BTC.',
      [LABELS.MINT_FEES]: 'Commission, approved by the user, charged when Lombard claims a BTC deposit and mints BTC.b on the user\'s behalf.',
    },
    UserFees: {
      [LABELS.REDEMPTION_FEES]: 'Fixed fee (0.0001 BTC.b) paid by users on each BTC.b redemption for BTC.',
      [LABELS.MINT_FEES]: 'Commission paid by users when Lombard claims their BTC deposit and mints BTC.b for them.',
    },
    Revenue: {
      [LABELS.REDEMPTION_FEES]: 'BTC.b redemption fees paid to the Lombard treasury.',
      [LABELS.MINT_FEES]: 'Deposit-claim commissions paid to the Lombard treasury.',
    },
    ProtocolRevenue: {
      [LABELS.REDEMPTION_FEES]: 'BTC.b redemption fees paid to the Lombard treasury.',
      [LABELS.MINT_FEES]: 'Deposit-claim commissions paid to the Lombard treasury.',
    },
  },
}

export default adapter

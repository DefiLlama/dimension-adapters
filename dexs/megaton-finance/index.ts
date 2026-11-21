import * as sdk from "@defillama/sdk";
import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { normAddr, pageToncenterTxs } from "../../helpers/ton";

const ton = sdk.chains.ton

// Megaton's pools, from the protocol's own list (https://megaton.fi/api/lp/infoList, archived at
// https://web.archive.org/web/20261020172146/https://megaton.fi/api/lp/infoList). Every megaton.fi/api
// route has answered with the site's index.html since, so the list is kept here.
const POOLS = [
  'EQCyYbIBZfW2Z-yEMjkJx0ofQ95l2m29as5zMs3RAkNodmPK', 'EQCi8rx-uLcg7NFHIa3DA55R3j2VAzrNI3FpMncV5xaMl9ld',
  'EQCw12SVuR1u2bRv1kKzR2CaC6sH9W-k13lJnf5dxt5O7711', 'EQBzQP2_ymgiepSGlfixNQCVckMMk23vWv1z0IQU3WCtJaPs',
  'EQChnYNwPfu4SjOPcITSoqCEy-pEdj-8H7YfTilM_l0ikBLI', 'EQD0uNCf5Y7zOZ7h2-Y6kkcRVJzmmQQiGHZyJ-B9WEiLN6GT',
  'EQCKM-dCebtf-9-xMoNDbTHy-4rjofvSbMC61uHV_R0-pO7V', 'EQCddpFoUi7A9YpUGDRy0e-D9XUhJu_c6NEpRMZApJwzy0wm',
  'EQCoTT8jnkUDK83vdPgWkHcnJgdd3tf08lYhl5_Nq2hn6M8_', 'EQA7fKcmzBdDKP8F7cI7SfDo48V9V7giHF-WW2ayQC2ExhjN',
  'EQCJZrZxiA80zXCZTERCHW3BuQcOB3cl5Z3pG2anL7EM505O', 'EQALdzKxIV3nPiG5NxP8dsvsP8PbVxYYgelqxMBp61gF4XP8',
  'EQDE-uE6COUoPjIDS_Jl8P0iE945W0DB9XwdMr5b4nxoIEMX', 'EQAMUeI-fww_W1kCwMcDfZooBhTtr1zwcy86tlHetvpvqd8A',
  'EQDl29-P2VOxFDl64XAZleUcytGYS_8o5PvxjCLCKgU0eUUJ', 'EQBwYx99atSlEOOIJpt43BFM0eAl_IWNEE8W-ZLHWe-h_Fte',
  'EQC2eIKmg9YV5rTBpmhYphlR96m3jpFdgeiFikRtG3p9WZV8', 'EQBWRziIshSR-rGe-3tKzeN1UeHU7y9RGewVrZ7oMrgdXAKU',
  'EQAACdyfS_QTk_fFqIrHTm8PBf5w-bizY0LgkkbPiHtppLkE', 'EQCocXc3t9WDrQ2gnq6kD3gJ7ENvA-LJ9PmFhSGX_pG3gHtO',
  'EQC3QIX0cODPDubkeJz6AM2eTUCSDAVXHWb_DnmLb3EEgdsQ', 'EQBogXswvRWZp7fJ1PqVakoK-Tb5NbxT1yBRwoAweGJeba_o',
  'EQCwrvlVKXMDVKlsIvYK6bJmKvkGn1UiU4W46rgKB0r6Cpa2', 'EQDtKEfVIv44CAb9_TYScFbaVMyvC2CC_LnZ3XFOyWi5SuxB',
  'EQBx08JqyANSDeyr-E3-YGT-K4qeSSgEnnDdayxvmcZhaej1', 'EQA6PtA6h5_OdshSjt3OVW_2rGCHbw-p1PExJOnJSgiYzHfT',
  'EQBR7E-n2jS1-YEwODk76jZgGiS59PypttA07NiSAG8XTFof', 'EQCwDbR07y-FgGbBkw8WZBqczXkMsroahc4NuNArJevNJYjc',
  'EQC1Uk9Ig0k_PXtMLsJQibSOTMZ_27sGbtR2cH4wmVp1ZZvk', 'EQAENxyAtonJ8TzhI3ZDOrvPxZfCcuHUwzYJALr26E0KeHSA',
  'EQCHylf-hOqL4FbbK77UZzn1gHpdhEc5ZZh1HDFmPXfY48Cq', 'EQCR2eoRfQrKcYsXfyYkKb4wmZ4vmvfLdOwnhV09JbQl4wef',
  'EQAJNt2B7bDn6GZ2aC3YQybIL_AVAn2A7rN6yuzJsQ4Ls-I8', 'EQCSbsYkouaBFzc-4UnVbhNlbqSAzTy9cdnJzEm116Hc5JQw',
  'EQA0CjwkEbP9VHKgCLE7cN257TKGiYGAKm4NBUgHCO31hKbV', 'EQDvsS2KrivmB2f2FnxwZGkATVgAFOXfU4pDOV5MH9FgRImu',
  'EQC9QcqAzLi9Fl_y16haZq9PFjbyD96bC2ViI2rcdPwIi7Q7', 'EQAGGbNHLPFQAigQmD0jShMRRx1gPlSGfwE7dgluCj3O8gsN',
  'EQDecZ9j-Am9MdMkq4jAeRL4FpYx_pT7W51A7BSkvvKm1qaq', 'EQBA4xqGUvmRaTuhIYFchaQVIyPLHDEV8P3EwkOiB-WKxbsN',
  'EQANtmLNo0qtd5CsMcjB_vjXeJe5zpk5UxwJ1_Ne1PpK-heA', 'EQATBztgwn6d8a2qtoprQoswRT90xUj6yoU8ZMfk7M4gWh16',
  'EQAj9z25Qi-vOka6m7Yl-xU9RKVXk55yxJDlcEqfMzcSOkcd', 'EQAY2e190WU-bSLm8zd6jqE9aBUQ6GpWiTzepyBo04_zbIzJ',
  'EQBibMdEyQvDpS-DhI33GGnmkAoXOfH8BFPsBuVzvpVIVIeU', 'EQAf8MFb5wuG0YslstDf0rJyQEjiZbj4BR5tG0JTgkpsboPK',
  'EQCuf4XDIxQbOc-jQysJ0kdIaaYIuNUyxOl2bTM_88mP8U-n', 'EQB7NV8uMmmBW6lHmoazsaj7n_yg7E1SVMIs0SOAw2ABD34z',
  'EQBgmUgbh9bXbtQuac0eB2O3j4aePk4ZqjImFa2KC4xv0ov6', 'EQCQxEaJT_EucovVh3QZgqedygO26scLho-gjeaeE7ey-dmA',
  'EQAflzcq8V4HvBabq9FKF9BPn8loDXFQQP0N4i5qhsHVU4JE', 'EQBhmYJNKpmSBlgoe6480PEPYwG8vwovznLQx3D9IMCx8Mi-',
  'EQBxhpyJJ8pB0URRcwEl2hAVSbnbByk6eJedrprN2sB3WRQA', 'EQDQLBVxeT74UzUOvsMem-kS2hromJ8qJdRgBdoT2T0GRtkA',
]

const QUOTE_TOKENS = [
  ADDRESSES.ton.TON_4,
  ADDRESSES.ton.jUSDT,
  ADDRESSES.ton.ORC,
]

const TRANSFER_NOTIFICATION = '0x7362d09c'
const JETTON_TRANSFER = '0x0f8a7ea5'

// transfer_notification and transfer bodies both start with op:uint32 query_id:uint64 amount:Coins
function jettonAmount(body: string): bigint {
  const boc = ton.parseBoc(Buffer.from(body, 'base64'))
  if (boc.root[0] !== 0) throw new Error('Megaton: jetton message body root is not the first cell')
  const reader = new ton.BitReader(boc.cellData.subarray(2, 2 + Math.ceil(boc.cellData[1] / 2)))
  reader.readUint(32) // op
  reader.readBigUint(64) // query_id
  return reader.readBigUint(reader.readUint(4) * 8)
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances()
  const txs = await pageToncenterTxs({ account: POOLS, startTimestamp: options.startTimestamp, endTimestamp: options.endTimestamp })
  if (!txs.length) return { dailyVolume }

  const wallets = await ton.getJettonWallets({ owner: POOLS })
  const walletInfo = new Map<string, { owner: string, jetton: string }>()
  for (const w of wallets) walletInfo.set(normAddr(w.address), { owner: normAddr(w.owner), jetton: ton.normalizeAddress(w.jetton) })

  for (const tx of txs) {
    if (tx.description?.aborted) continue
    const inMsg = tx.in_msg
    if (inMsg?.opcode !== TRANSFER_NOTIFICATION) continue
    const outMsg = tx.out_msgs.find((m: any) => m.opcode === JETTON_TRANSFER && normAddr(m.destination) !== normAddr(inMsg.source))
    if (!outMsg) continue

    const pool = normAddr(tx.account)
    const sold = walletInfo.get(normAddr(inMsg.source))
    const bought = walletInfo.get(normAddr(outMsg.destination))
    if (!sold || !bought || sold.owner !== pool || bought.owner !== pool)
      throw new Error(`Megaton: swap ${tx.hash} uses a wallet that is not indexed as owned by pool ${tx.account}`)

    const soldRank = QUOTE_TOKENS.indexOf(sold.jetton)
    const boughtRank = QUOTE_TOKENS.indexOf(bought.jetton)
    if (soldRank === -1 && boughtRank === -1) continue
    if (boughtRank === -1 || (soldRank !== -1 && soldRank <= boughtRank))
      dailyVolume.add(sold.jetton, jettonAmount(inMsg.message_content.body).toString())
    else
      dailyVolume.add(bought.jetton, jettonAmount(outMsg.message_content.body).toString())
  }

  return { dailyVolume }
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TON],
  start: '2023-02-08',
  methodology: {
    Volume: 'Value of tokens swapped in Megaton Finance pools, read from the pools\' on-chain transactions. Each swap is valued on its WTON, jUSDT or ORC leg; pools pairing only Orbit Bridge tokens (which trade far below their peg) or MEGA are excluded.',
  },
};

export default adapter;

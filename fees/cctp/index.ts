import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { queryDuneSql } from "../../helpers/dune"

const CCTP_MESSENGER = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d';
const MINT_AND_WITHDRAW_EVENT = 'event MintAndWithdraw (address indexed mintRecipient, uint256 amount, address indexed mintToken, uint256 feeCollected)'

const STELLAR_CCTP_CONTRACT = 'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL'

const STARKNET_CCTP_CONTRACT = '0x07d421B9cA8aA32DF259965cDA8ACb93F7599F69209A41872AE84638B2A20F2a'
const STARKNET_MINT_AND_WITHDRAW_SELECTOR = '0x02dc261d291ce25f6904f36a80576ecb181e55a55d2735b3a540f4775b62568a'

const SOLANA_CCTP_PROGRAM = 'CCTPV2vPZJS2u2BBsUoscuikbYjnpFmbFsvVuJdgUMQe'
const SOLANA_MINT_AND_WITHDRAW_DISCRIMINATOR = '0xe445a52e51cb9a1d4b43e546a27e0047'

//chains can be found here: https://bridge.usdc.com/api/feature-flags
const chainConfig = {
    [CHAIN.BASE]: { start: '2025-02-10' },
    [CHAIN.AVAX]: { start: '2025-02-10' },
    [CHAIN.ETHEREUM]: { start: '2025-02-11' },
    [CHAIN.LINEA]: { start: '2025-03-07' },
    [CHAIN.ARBITRUM]: { start: '2025-04-03' },
    [CHAIN.SONIC]: { start: '2025-04-30' },
    [CHAIN.WC]: { start: '2025-05-15' },
    [CHAIN.OPTIMISM]: { start: '2025-05-15' },
    [CHAIN.POLYGON]: { start: '2025-06-09' },
    [CHAIN.UNICHAIN]: { start: '2025-06-11' },
    //[CHAIN.SEI]: { start: '2025-06-25' },
    [CHAIN.PLUME]: { start: '2025-08-08' },
    [CHAIN.HYPERLIQUID]: { start: '2025-08-11' },
    [CHAIN.XDC]: { start: '2025-08-21' },
    [CHAIN.INK]: { start: '2025-08-21' },
    [CHAIN.MONAD]: { start: '2025-09-15' },
    [CHAIN.STELLAR]: { start: '2026-04-16', fetch: fetchStellar },
    [CHAIN.STARKNET]: { start: '2025-10-29', fetch: fetchStarknet },
    [CHAIN.SOLANA]: { start: '2025-05-29', fetch: fetchSolana },
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances()

    const mintAndWithdrawLogs = await options.getLogs({
        target: CCTP_MESSENGER,
        eventAbi: MINT_AND_WITHDRAW_EVENT,
    })

    mintAndWithdrawLogs.forEach(log => {
        dailyFees.add(log.mintToken, log.feeCollected, "Bridge Fees");
    })

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

async function fetchStellar(options: FetchOptions) {
    const dailyFees = options.createBalances()

    const query = `
      select data_decoded
      from stellar.history_contract_events
      where contract_id = '${STELLAR_CCTP_CONTRACT}'
        and successful = true
        and json_extract_scalar(topics_decoded, '$[0].symbol') = 'mint_and_withdraw'
        and closed_at >= from_unixtime(${options.startTimestamp})
        and closed_at < from_unixtime(${options.endTimestamp})
    `

    const rows: { data_decoded: string }[] = await queryDuneSql(options, query)

    rows.forEach(row => {
        const parsed = JSON.parse(row.data_decoded)
        const feeEntry = parsed.map.find((e: any) => e.key.symbol === 'fee_collected')
        dailyFees.addCGToken('usd-coin', Number(feeEntry.val.i128) / 1e7, "Bridge Fees")
    })

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

async function fetchStarknet(options: FetchOptions) {
    const dailyFees = options.createBalances()

    const query = `
      select data, keys
      from starknet.events
      where from_address = ${STARKNET_CCTP_CONTRACT}
        and keys[1] = ${STARKNET_MINT_AND_WITHDRAW_SELECTOR}
        and block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
    `

    const rows: { data: string[]; keys: string[] }[] = await queryDuneSql(options, query)

    rows.forEach(row => {
        const mintToken = row.keys[2]
        const feeCollected = BigInt(row.data[2]) + (BigInt(row.data[3]) << 128n)
        dailyFees.add(mintToken, feeCollected, "Bridge Fees")
    })

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

async function fetchSolana(options: FetchOptions) {
    const dailyFees = options.createBalances()

    // data = 16-byte anchor+event discriminator, then mintRecipient(32) + amount u64 LE(8) + mintToken(32) + feeCollected u64 LE(8)
    const query = `
      select
        to_base58(VARBINARY_SUBSTRING(data, 57, 32)) as mint_token,
        VARBINARY_TO_UINT256(VARBINARY_REVERSE(VARBINARY_SUBSTRING(data, 89, 8))) as fee_collected
      from solana.instruction_calls
      where executing_account = '${SOLANA_CCTP_PROGRAM}'
        and VARBINARY_SUBSTRING(data, 1, 16) = ${SOLANA_MINT_AND_WITHDRAW_DISCRIMINATOR}
        and block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
    `
    const rows: { mint_token: string; fee_collected: string }[] = await queryDuneSql(options, query)
    rows.forEach(row => {
        dailyFees.add(row.mint_token, row.fee_collected, "Bridge Fees")
    })

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Fast transfer fees(0-14 BPs) and forward fees charged by CCTP",
    UserFees: "Fast transfer fees(0-14 BPs) and forward fees paid by users for bridging USDC",
    Revenue: "All the fees are revenue",
    HoldersRevenue: "All the revenue goes to the protocol",
}

const breakdownMethodology = {
    Fees: {
        'Bridge Fees': 'Fast transfer fees(0-14 BPs) and forward fees charged by CCTP',
    },
    Revenue: {
        'Bridge Fees': 'Fast transfer fees(0-14 BPs) and forward fees charged by CCTP',
    },
    ProtocolRevenue: {
        'Bridge Fees': 'Fast transfer fees(0-14 BPs) and forward fees charged by CCTP',
    },
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    adapter: chainConfig,
    methodology,
    breakdownMethodology,
    dependencies: [Dependencies.DUNE],
}

export default adapter
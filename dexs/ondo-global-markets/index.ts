import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const TRADE_EXECUTED_ABI = "event TradeExecuted (uint256 executionId, uint256 attestationId, uint256 chainId, bytes32 userId, uint8 side, address asset, uint256 price, uint256 quantity, uint256 expiration, bytes32 additionalData)";

const chainConfig = {
    [CHAIN.ETHEREUM]: {
        contract: '0x2c158BC456e027b2AfFCCadF1BDBD9f5fC4c5C8c',
        start: '2025-07-15',
    },
    [CHAIN.BSC]: {
        contract: '0x91f8Aff3738825e8eB16FC6f6b1A7A4647bDB299',
        start: '2025-10-09',
    },
    [CHAIN.SOLANA]: {
        contract: 'XzTT4XB8m7sLD2xi6snefSasaswsKCxx5Tifjondogm',
        start: '2026-01-20',
    },
}

const fetchEvm = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const trades = await options.getLogs({
        target: chainConfig[options.chain].contract,
        eventAbi: TRADE_EXECUTED_ABI,
    });

    trades.forEach((trade: any) => {
        dailyVolume.addUSDValue((Number(trade.quantity) / 1e18) * (Number(trade.price) / 1e18));
    });

    return { dailyVolume };
}

// On Solana the GM program emits TradeExecuted with only an execution_id; the
// notional lives in the mint/redeem instruction args. Decode price+amount from
// the instruction data (Anchor: 8-byte discriminator, 16-byte attestation_id,
// then u64 price at byte 25 and u64 amount at byte 33, both scaled by 1e9).
const SOLANA_TRADE_DISCRIMINATORS = [
    '0x19745c2d2bbc5f3a', // mint_with_usdon
    '0x801c85ad478eb9ce', // mint_with_usdc
    '0xe7795d218ffc520d', // redeem_for_usdon
    '0x9609d7dcff9d4a4e', // redeem_for_usdc
];

const fetchSolana = async (options: FetchOptions) => {
    const [row] = await queryDuneSql(options, `
        SELECT COALESCE(SUM(
            (bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 25, 8))) / 1e9)
            * (bytearray_to_uint256(bytearray_reverse(bytearray_substring(data, 33, 8))) / 1e9)
        ), 0) AS daily_volume
        FROM solana.instruction_calls
        WHERE TIME_RANGE
            AND tx_success
            AND executing_account = '${chainConfig[options.chain].contract}'
            AND bytearray_substring(data, 1, 8) IN (${SOLANA_TRADE_DISCRIMINATORS.join(', ')})
    `);

    const dailyVolume = options.createBalances();
    dailyVolume.addUSDValue(row.daily_volume);
    return { dailyVolume };
}

const fetch = (options: FetchOptions) => {
    if (options.chain === CHAIN.SOLANA) {
        const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
        if ((options.toTimestamp * 1000) > tenHoursAgo) {
            throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
        }
        return fetchSolana(options);
    }
    return fetchEvm(options);
}

const methodology = {
    Volume: 'Buy and sell volume of Ondo tokenized stocks and ETFs on Ondo Global Markets: on Ethereum and BNB Chain from on-chain TradeExecuted events, and on Solana from the program mint/redeem trades (price times quantity) routed through Jupiter.'
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.SOLANA],
    adapter: chainConfig,
    methodology,
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
};

export default adapter;

import { CHAIN } from "../../helpers/chains";

const SocketGatewayContracts: { [key: string]: string } = {
    [CHAIN.ETHEREUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
    [CHAIN.ARBITRUM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
    [CHAIN.OPTIMISM]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
    [CHAIN.BASE]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
    [CHAIN.BSC]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
    [CHAIN.POLYGON]: '0x3a23f943181408eac424116af7b7790c94cb97a5',
}

const BungeeGatewayContracts: {
    [key: string]: {
        audited: Array<string>;
        unaudited: Array<string>;
    }
} = {
    [CHAIN.ETHEREUM]: {
        audited: [],
        unaudited: ['0xe772551F88E2c14aEcC880dF6b7CBd574561bf82'],
    },
    [CHAIN.OPTIMISM]: {
        audited: ['0x09DAbdD517Ff1e155DeDEF64EC629Ca0285a31af'],
        unaudited: ['0x9c366293ba7e893cE184d75794330d674E4D17c2']
    },
    [CHAIN.BASE]: {
        audited: ['0x84F06fBaCc4b64CA2f72a4B26191DAD97f2b52BA'],
        unaudited: ['0x01710cdb7319292ed50a3f92561a599f5c650e2c'],
    },
    [CHAIN.ARBITRUM]: {
        audited: ['0xCdEa28Ee7BD5bf7710B294d9391e1b6A318d809a'],
        unaudited: ['0x8d00ad02df0c7b0c379bc1cb49fd74aa10698bfc'],
    },
    [CHAIN.BSC]: {
        audited: ['0x9aF2b913679049c966b77934af4CbE7Bb36Cf9D3'],
        unaudited: ['0x6a138b12be537e3b47328d627c1699bfaaaa68ce'],
    },
    [CHAIN.POLYGON]: {
        audited: ['0x6DDe7CF4e6A6f53F058Bf5d2B4a54aFBba11EE54'],
        unaudited: ['0x652e1b759516fe79b2b63753f1c7b3c44faa3df8'],
    },
    [CHAIN.XDAI]: {
        audited: [
            '0x5e01dbBBe59F8987673FAdD1469DdD2Be71e00af',
        ],
        unaudited: ['0x8f503B6d9fFdae8d375d1E226b71B4B3144D3849'],
    },
    [CHAIN.PLASMA]: {
        audited: ['0x8f503B6d9fFdae8d375d1E226b71B4B3144D3849'],
        unaudited: [],
    },
}

export function fetchBimChains(): Array<string> {
    const chains: { [key: string]: boolean } = {}
    for (const chain of Object.keys(SocketGatewayContracts).concat(Object.keys(BungeeGatewayContracts))) {
        chains[chain] = true
    }
    return Object.keys(chains)
}

// Bim moved to Bungee's new API: txs now go through AllowanceHolder -> OpenRouter
// (same addresses on every chain). The RequestExecuted event only carries an opaque
// quoteId, but bim's integrator fee wallet is always present in the calldata
// (FeeData.receiver on swap/bridge/swapAndBridge, a nested fee transfer on
// performActions), so we filter txs on it via Dune.
export const DUNE_START_TIMESTAMP = 1782259200; // 2026-06-24, first day fully on the new API
export const ALLOWANCE_HOLDER = '0x50c4e75a512f2a14a7b304787adf79c4531a5909';
export const OPEN_ROUTER = '0x50cfe7c1938db66a1a6d2e86d36f39fbef3d5c4a';
export const REQUEST_EXECUTED_TOPIC = '0xe2a752598b97815acff854b1d0b6d5c7f33b848bcbb541df9b76038287282467';
export const BIM_FEE_WALLET = '0x5c6bcf885453394ea71986bb8de596c34f9a19ee';
export const BIM_FEE_WALLET_WORD = '0x0000000000000000000000005c6bcf885453394ea71986bb8de596c34f9a19ee';
export const SWAP_SELECTOR = '0x1bb1a530'; // OpenRouter.swap
export const BRIDGE_SELECTOR = '0xb18248d5'; // OpenRouter.bridge
export const SWAP_AND_BRIDGE_SELECTOR = '0x324012e2'; // OpenRouter.swapAndBridge
export const PERFORM_ACTIONS_SELECTOR = '0x197aa51e'; // OpenRouter.performActions (batched cross-chain routes)

const DUNE_CHAIN_MAP: { [key: string]: string } = {
    [CHAIN.BSC]: 'bnb',
    [CHAIN.XDAI]: 'gnosis',
};

export const getDuneChain = (chain: string) => DUNE_CHAIN_MAP[chain] ?? chain;
export const duneChains = fetchBimChains().map((chain) => `'${getDuneChain(chain)}'`).join(', ');

// All bim txs on the new API: emit RequestExecuted from OpenRouter, enter directly
// or through AllowanceHolder.exec (inner calldata starts at byte 197), and carry
// bim's fee wallet in calldata. fee_pos is the 1-indexed position of the fee wallet
// word: for swap/bridge/swapAndBridge the input amount is the word right before it
// and the input token the word before that.
export const bimTxsCte = `
    SELECT
        t.blockchain,
        t.hash,
        t."to" AS tx_to,
        t.data,
        bytearray_position(t.data, ${BIM_FEE_WALLET_WORD}) AS fee_pos,
        CASE WHEN t."to" = ${ALLOWANCE_HOLDER}
            THEN bytearray_substring(t.data, 197, 4)
            ELSE bytearray_substring(t.data, 1, 4)
        END AS selector
    FROM evms.transactions t
    INNER JOIN (
        SELECT blockchain, tx_hash
        FROM evms.logs
        WHERE blockchain IN (${duneChains})
            AND contract_address = ${OPEN_ROUTER}
            AND topic0 = ${REQUEST_EXECUTED_TOPIC}
            AND TIME_RANGE
        GROUP BY 1, 2
    ) l ON t.blockchain = l.blockchain AND t.hash = l.tx_hash
    WHERE t.blockchain IN (${duneChains})
        AND t."to" IN (${ALLOWANCE_HOLDER}, ${OPEN_ROUTER})
        AND bytearray_position(t.data, ${BIM_FEE_WALLET_WORD}) > 0
        AND TIME_RANGE
`;

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

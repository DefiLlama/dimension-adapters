import axios from "axios";

const collectionsList = [
    "cryptopunks",
    "boredapeyachtclub",
    "mutant-ape-yacht-club",
    "otherdeed",
    "azuki",
    "clonex",
    "proof-moonbirds",
    "sandbox",
    "doodles-official",
    "fragments-by-james-jean",
    "proof-collective",
    "onchainmonkey",
    "cryptoninjapartners",
    "invisiblefriends",
    "utopiaavatars",
    "degentoonz-collection",
    "lens-protocol-profiles",
    "murakami-flowers-2022-official",
    "sandbox",
    "ens",
    "notablepepes",
    "the-devs-nft",
    "trump-digital-trading-cards",
    "etherpoap-og",
    "anipangsupporterclub",
    "ordinal-kubz",
    "chromie-squiggle-by-snowfro",
    "alpha-prestige-fusionist-official",
    "porsche-911",
    "strands-of-solitude",
    "tori-zero-redlab-3",
    "terraforms",
    "schizoposters",
    "thememes6529",
    "valhalla",
    "fidenza-by-tyler-hobbs",
    "goblintownwtf",
    "lilpudgys",
    "veefriends",
    "little-tinas-fantasy-phase-ii",
    "persistence-of-time-by-kush",
    "world-of-women-nft",
    "little-tinas-fantasy",
    "milady",
    "y00ts",
    "createra-genesis-land",
    "digidaigaku",
    "10ktf-stockroom",
    "fluralpha",
    "genesis-dimensional-stones",
    "cosmic-bloom-by-leo-villareal",
    "emblem-vault",
    "vv-checks-originals",
    "hoshiboshi-aries",
    "killabears",
    "kanpai-pandas",
    "elemental-fang-lijun",
    "moonbirds-oddities",
    "degods",
    "akidcalledbeast",
    "rektguy",
    "seizonofficial",
    "megapunks-pop",
    "beanzofficial",
    "pudgyrods",
    "momoguro-holoself",
    "thepotatoz",
    "mfers",
    "cool-cats-nft",
    "sappy-seals",
    "the-weirdo-ghost-gang",
    "0n1-force",
    "meebits",
    "official-v1-punks",
    "sewerpass",
    "renga",
    "vv-checks",
    "mocaverse",
    "thecaptainz",
    "clonex",
    "nakamigos",
    "gitcoin-presents",
    "owls-wtf",
    "opepen-edition",
    "hv-mtl",
    "pudgypenguins",
    "bored-ape-kennel-club",
    "boredapeyachtclub",
    "proof-moonbirds",
    "doodles-official",
    "azuki",
    "mutant-ape-yacht-club",
    "otherdeed",
    "wrapped-cryptopunks"
];



const fetchCollectionData = async (slug: string): Promise<{ data: CollectionResponse }> => axios.get(`https://api.opensea.io/api/v1/collection/${slug}`);

interface CollectionResponse {
    collection: {
        name: string
        twitter_username: string
        slug: string
        description: string
        primary_asset_contracts: Array<{
            address: string
            symbol: string
            image_url: string
            external_link: string
        }>
    }
}

(async () => {
    const multipleAddrColl = [] as CollectionResponse[]
    // switched to for of bc promise.all was getting rate limited
    for (const collSlug of collectionsList) {
        const coll = (await fetchCollectionData(collSlug)).data
        if (coll.collection.primary_asset_contracts.length === 1) {
            console.log(`"${coll.collection.primary_asset_contracts[0].address}": { slug: "${coll.collection.slug}" },`)
        } else {
            multipleAddrColl.push(coll)
        }
    }
    multipleAddrColl.forEach(coll => {
        coll.collection.primary_asset_contracts.forEach(addr => {
            console.log(`"${addr.address}": { slug: "${coll.collection.slug}" },`)
        })
    })
    /* const allColl = await Promise.all(collectionsList.map(fetchCollectionData))
    const multipleAddrColl = [] as CollectionResponse[]
    allColl.forEach(coll => {
        if (coll.collection.primary_asset_contracts.length === 1) {
            console.log(`"${coll.collection.primary_asset_contracts[0]}": "${coll.collection.slug}",`)
        }else {
            multipleAddrColl.push(coll)
        }
    })
    allColl.forEach(coll => {
        coll.collection.primary_asset_contracts.forEach(addr=>{
            console.log(`"${addr}": "${coll.collection.slug}"`)
        })
    }) */
})()
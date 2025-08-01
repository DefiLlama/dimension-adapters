const axios = require('axios');

(async function() {
  const response = await axios.get('https://api.curve.finance/api/getVolumes/arbitrum')

  const pools = {}
  for (const pool of response.data.data.pools) {
    if (!pools[pool.type]) {
      pools[pool.type] = []
    }

    pools[pool.type].push(pool.address)
  }

  for (const a of pools['main'])
  console.log(`'${a}',`)
})()

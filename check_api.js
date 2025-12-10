
const https = require('https');

https.get('https://api.hiro.so/v2/info', (res) => {
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      console.log(JSON.stringify(json, null, 2));
    } catch (e) {
      console.error(e);
    }
  });
}).on('error', (err) => {
  console.error(err);
});

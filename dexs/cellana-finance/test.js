
const axios = require('axios');

// Configure access method, including user-agent in header and proxy rules
const config_rule = {
    method: 'get',
    // headers: {
    //     'user-agent': 'axios/1.6.7' 
    // },
}


const url = 'https://httpbin.io/user-agent'

// Pass configuration and target URL detail into Axios request 
axios.request({ ...config_rule, url })
    .then(response => {
        // Handle the successful response
        response.status === 200 ?
            console.log('Response:', response.data) :
            console.log(response.status);
    })
    .catch(error => {
        // Handle errors
        console.error('Error:', `${error}`);
    });

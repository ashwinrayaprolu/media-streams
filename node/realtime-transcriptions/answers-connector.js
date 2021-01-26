const axios = require('axios');
const https = require('https');
//process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
// At instance level
const instance = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

class AnswersConnector{

    constructor() {

    }

    generateUrl(strings, ...values) {
        let str = '';
        strings.forEach((string, i) => {
            str += string + (values[i] || '');
        });
        return str.trim();
    }

    async getAnswer(questionVal,callCache,clients) {
        let interfaceId = clients[callCache.tenantContext];

        if(typeof interfaceId === "undefined"){
            interfaceId = 44;
        }

        console.log(`---------------Querying context for :${callCache.tenantContext}   with interface id: ${interfaceId}`);

        this.answersBackendUrl = this.generateUrl`https://localhost:8007/json/?interfaceID=${interfaceId}&sessionId=3df61f1f-9438-11e9-aff1-6da976f889a9&requestType=NormalRequest&source=1&id=-1&question=${questionVal}&Answers7=true`;

        console.log(`Backend URL: ${this.answersBackendUrl.trim()}`);

        try {
            // fetch data from a url endpoint
            const response =  await instance.get(this.answersBackendUrl.trim());
            const data = await response.data;
            return data;
        } catch(error) {
            console.log("error", error);
            // appropriately handle the error
        }

        //let resp = undefined;
        return undefined;


    }


}


module.exports = AnswersConnector;

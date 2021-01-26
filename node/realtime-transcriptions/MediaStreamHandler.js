const accountSid = 'ACe86a004dc18c1e5423514b9e61133e48';
const authToken = '5ee700c90320c5e29afb4490ce800342';
const xmldoc = require('xmldoc');
const DOMParser = require('xmldom').DOMParser;
const xml2js = require('xml2js');
const parser = require('fast-xml-parser');
const he = require('he');

const options = {
    attributeNamePrefix : "@_",
    attrNodeName: "attr", //default is 'false'
    textNodeName : "#text",
    ignoreAttributes : true,
    ignoreNameSpace : false,
    allowBooleanAttributes : false,
    parseNodeValue : true,
    parseAttributeValue : false,
    trimValues: true,
    cdataTagName: "__cdata", //default is 'false'
    cdataPositionChar: "\\c",
    parseTrueNumberOnly: false,
    arrayMode: true, //"strict"
    attrValueProcessor: (val, attrName) => he.decode(val, {isAttributeValue: true}),//default is a=>a
    tagValueProcessor : (val, tagName) => he.decode(val), //default is a=>a
    stopNodes: ["parse-me-as-string"]
};




const client = require('twilio')(accountSid, authToken);
const TranscriptionService = require('./transcription-service');
const stripHtml = require("string-strip-html");
const AnswersConnector = require('./answers-connector');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

// Regular expression to match change of context
const launchWords = ["go to ","goto ","ask ","open ","talk to ","Okay, go to ","Okay, goto ","Okay, ask ","Okay, open ","Okay, talk to ","Okay go to ","Okay goto ","Okay ask ","Okay open ","Okay talk to "];
const clients = {
    "capitolone":44,
    "capitol one":44,
    "capitalone":44,
    "capital one":44,
    "td":43,
    "dee dee":43,
    "tee dee":43,
    "td.":43,
    "t. d.":43,
    "t d":43,
    "canadian government":45
}

const clientNames = Object.keys(clients);
const searchPermutations = [launchWords,clientNames];

String.prototype.nthIndexOf = function(pattern, n) {
    var i = -1;

    while (n-- && i++ < this.length) {
        i = this.indexOf(pattern, i);
        if (i < 0) break;
    }

    return i;
}


/**
 * This function is used to generate permutations of launch words
 * @param set
 * @returns {[]}
 */
function permute(set) {
    const results = [];

    function generatePerm(front, i) {
        // for each element in the ith array
        for (let j = 0; j < set[i].length; j++) {
            // take a copy of the part we've already computed
            let perm = front.slice(0);
            // add the jth element from the ith array
            perm += set[i][j];

            // if we haven't used every array yet,
            // move on to the i+1th array
            if (i < set.length - 1) generatePerm(perm, i + 1);
                // else add our perm to the result array
            // and move onto the j+1th element of the ith array
            else results.push(perm);
        }
    }

    // start off our recursion with an
    // empty permutation on the first array
    generatePerm('', 0);
    return results;
}

// Changes XML to JSON
function xmlToJson(xml) {

    // Create the return object
    let obj = {};

    if (xml.nodeType == 1) { // element
        // do attributes
        if (xml.attributes.length > 0) {
            obj["@attributes"] = {};
            for (var j = 0; j < xml.attributes.length; j++) {
                var attribute = xml.attributes.item(j);
                obj["@attributes"][attribute.nodeName] = attribute.nodeValue;
            }
        }
    } else if (xml.nodeType == 3) { // text
        obj = xml.nodeValue;
    }

    // do children
    if (xml.hasChildNodes()) {
        for(let i = 0; i < xml.childNodes.length; i++) {
            let item = xml.childNodes.item(i);
            let nodeName = item.nodeName;
            if (typeof(obj[nodeName]) == "undefined") {
                obj[nodeName] = xmlToJson(item);
            } else {
                if (typeof(obj[nodeName].push) == "undefined") {
                    let old = obj[nodeName];
                    obj[nodeName] = [];
                    obj[nodeName].push(old);
                }
                obj[nodeName].push(xmlToJson(item));
            }
        }
    }
    return obj;
};


/**
 * Generic log handler function
 * @param message
 * @param args
 */
function log(message, ...args) {
    console.log(new Date(), message, ...args);
}


/***
 *
 * Below code handles websocket media streams
 * and passed onto google cloud Speech to Text
 */
class MediaStreamHandler {
    constructor(connection,mcache) {
        this.metaData = null;
        this.trackHandlers = {};
        this.eventData  = {};
        this.mcache = mcache;
        connection.on('message', this.processMessage.bind(this));
        connection.on('close', this.close.bind(this));

    }

    /**
     * Handle websocket message
     * @param message
     */
    processMessage(message){
        //if (message.MediaStreamHandlertype === 'utf8') {
            //const data = JSON.parse(message.utf8Data);

        const data = JSON.parse(message);

        switch (data.event) {
            case "connected":
                console.log(`A new call has connected for : ${this.eventData.callSid}`);

                break;
            case "start":
                this.metaData = data.start;
                log(message);
                console.log(`Starting Media Stream CallSID: ${data.start.callSid}`);
                console.log(`Starting Media Stream StreamSID: ${data.start.streamSid}`);
                this.eventData.callSid = data.start.callSid;
                this.eventData.streamSid = data.start.streamSid;

                break;
            case "media":
                // Write Media Packets to the recognize stream
                const that = this;

                if (this.trackHandlers[this.eventData.callSid] === undefined) {
                    const service = new TranscriptionService();
                    const answersConnnector = new AnswersConnector();


                    service.on('transcription', (transcription) => {
                        log(`Transcription (${this.eventData.callSid}): ${transcription}`);

                        //log(`Call SID:     ${that.eventData.callSid}`);



                        this.processQuestion(transcription, that, answersConnnector);


                    });
                    this.trackHandlers[this.eventData.callSid] = service;
                }
                this.trackHandlers[this.eventData.callSid].send(data.media.payload);
                break;
            case "stop":
                log('Media WS: closed. Call Ended');

                for (let track of Object.keys(this.trackHandlers)) {
                    log(`Closing ${track} handler`);
                    this.trackHandlers[track].close();
                }
                break;
        }

        //} else if (message.type === 'binary') {
        //    log('Media WS: binary message received (not supported)');
        //}
    }

    /**
     * This method is used to process question
     * @param transcription
     * @param that
     * @param answersConnnector
     */
    processQuestion(transcription, that, answersConnnector) {

        let origTranscription = transcription.trim().toLowerCase();

        console.log("Message:"+origTranscription);

        let callCache = that.mcache.get(that.eventData.callSid);
        callCache.tenantContext = "capital one";
        //}
        that.mcache.put(that.eventData.callSid, callCache);

        if(!(origTranscription.startsWith("ask") ||  origTranscription.startsWith("where") || origTranscription.startsWith("why") || origTranscription.startsWith("what"))){
            log()
            return;
        }

        const searchSentences = permute(searchPermutations);

        searchSentences.forEach(searchSentence => {
            //log(`Searching for " ${searchSentence.toLowerCase()}  "   in      "  ${origTranscription}  "`)
            //if(origTranscription.startsWith(searchSentence.toLowerCase())){
            let keyWordIndex = origTranscription.indexOf(searchSentence.toLowerCase());
            if(keyWordIndex > -1){
                log(`Matched `)
                try{
                    transcription = origTranscription.substr(keyWordIndex+searchSentence.length+1);
                }catch(e){
                    transcription = "";
                }

                // Now find client context
                let tenantContext = searchSentence;
                launchWords.forEach(launchWord => {
                    tenantContext = tenantContext.toLowerCase().replace(launchWord.toLowerCase(),"");
                });

                // Remaining sentence is client
                let callCache = that.mcache.get(that.eventData.callSid);
                callCache.tenantContext = tenantContext;
                that.mcache.put(that.eventData.callSid, callCache);

                log(`${tenantContext}   got   : ${transcription}`);
            }
        });


        // Remaining sentence is client

        //let callCache1 = that.mcache.get(that.eventData.callSid);
        //if(callCache.tenantContext === ""){



        if (origTranscription === 'bye.' || origTranscription === 'Goodbye.' || origTranscription === 'bye. bye.' || origTranscription === 'go to main menu.') {

            // Redirect to main menu
            const voiceResponse = new VoiceResponse();
            voiceResponse.redirect('/twiml');

            client.calls(that.eventData.callSid)
                .update({
                    twiml: voiceResponse.toString()
                })
                .then(call => {
                    console.log(call.to);
                });

            return;

        }


        log(`(-----User)(${callCache.Caller}) Says:  ${transcription}`);


        if(transcription.trim() === ""){
            client.calls(that.eventData.callSid)
                .update({
                    twiml: `
                            <Response>
                                <Say>Please ask a question</Say>
                                <Pause length="60"/>
                            </Response>
                    `
                })
                .then(call => {

                    console.log(call.to);
                });
            return;
        }




        //log("Before Query :               "+JSON.stringify(callCache,null,2));

        (async () => {
            let responseData = await answersConnnector.getAnswer(transcription,callCache,clients);
            console.log(responseData);
            //console.log(`After transcription CallSID: ${that.eventData.callSid}`);

            let responseToRender = "No response found please try some other query";
            let voiceResponse = "";
            let digitalResponse = "";

            if (typeof responseData != "undefined" && typeof responseData.exactMatches != "undefined" && responseData.exactMatches.length > 0) {


                //console.log(responseData);

                // convert XML to JSON
                await (async () => {
                    try {
                        let  jsonObj = {};
                        //jsonObj = await xml2js.parseStringPromise("<response>"+responseData.exactMatches[0].body+"</response>", { mergeAttrs: true });
                        //if( parser.validate("<response>"+responseData.exactMatches[0].body+"</response>") === true) { //optional (it'll return an object in case it's not valid)
                            //jsonObj = parser.parse("<response>"+responseData.exactMatches[0].body+"</response>",options);
                        let xmlDoc = new DOMParser().parseFromString("<response>"+responseData.exactMatches[0].body+"</response>","text/xml");
                            jsonObj = xmlToJson(xmlDoc.documentElement);
                        //}
                        // convert it to a JSON string

                        const json = JSON.stringify(jsonObj, null, 4);
                        // log JSON string
                        //console.log(json);
                        jsonObj.div.forEach(channelResponse => {
                            if(channelResponse["@attributes"].mode === "Voice"){
                                voiceResponse = channelResponse["#text"];
                            }else if(channelResponse["@attributes"].mode === "Digital"){


                                // Add paragraphs
                                if(typeof channelResponse["p"] != "undefined"){
                                    channelResponse["p"].forEach(para => {
                                        if(typeof para["#text"] !="undefined" && (para["#text"].trim() != "" && para["#text"].trim() != "&nbsp;")) {
                                            digitalResponse = digitalResponse + "\n" + para["#text"];
                                        }
                                    });
                                }

                                // Add any lists
                                if(typeof channelResponse["ul"] != "undefined") {
                                    channelResponse["ul"].forEach(unOrderedList => {
                                        if(typeof unOrderedList["li"] != "undefined") {
                                            unOrderedList["li"].forEach(listObj => {
                                                if (typeof listObj["#text"] != "undefined" && listObj["#text"].trim() != "") {
                                                    digitalResponse = digitalResponse + "\n  *  " + listObj["#text"];
                                                }
                                            });
                                            digitalResponse = digitalResponse + "\n\n";
                                        }
                                    });
                                }


                                // Finally add any text
                                if (typeof channelResponse["#text"] != "undefined" && channelResponse["#text"].trim() != "") {
                                    digitalResponse = digitalResponse + "\n" +channelResponse["#text"].trim();
                                }
                            }
                        })



                    } catch (err) {
                        console.log(err);
                    }
                })();




                //responseToRender = stripHtml(responseData.exactMatches[0].body).replace(/^(.{120}[^\s]*).*/, "$1"); ;
                responseToRender = voiceResponse;
                //responseToRender = stripHtml(responseData.exactMatches[0].body);
            }

            if(typeof callCache.tenantContext === "undefined"){
                callCache.tenantContext = "Answers";
            }




            client.calls(that.eventData.callSid)
                .update({
                    twiml: `
                            <Response>
                                <Say>${responseToRender}</Say>
                                <Pause length="60"/>
                            </Response>
                    `
                })
                .then(call => {

                    if(callCache.tenantContext != "Answers"  && digitalResponse != ""){
                        client.messages
                            .create({
                                body: `Question asked: ${transcription} \n ${digitalResponse}`,
                                from: `${callCache.Called}`,
                                to: `${callCache.Caller}`
                            })
                            .then(message => console.log(message.sid));
                    }
                    //console.log(call.to);
                });

            //console.log(`Complete updating callsid: ${that.eventData.callSid}`);
        })();


    }

    close(){
        log('Media WS: closed');

        for (let track of Object.keys(this.trackHandlers)) {
            log(`Closing ${track} handler`);
            this.trackHandlers[track].close();
        }
    }
}


module.exports = MediaStreamHandler;


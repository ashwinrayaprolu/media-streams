const WebSocket = require("ws");
const express = require('express');
const VoiceResponse = require('twilio').twiml.VoiceResponse;
const urlencoded = require('body-parser').urlencoded;
const MediaStreamHandler = require('./MediaStreamHandler');
const mcache = require('memory-cache');


const app = express();
const server = require("http").createServer(app);
const HTTP_SERVER_PORT = 8080;

function log(message, ...args) {
    console.log(new Date(), message, ...args);
}

/**
 * Below code is required for websocket connections
 */

const wss = new WebSocket.Server({ server });
wss.on("connection", function connection(ws) {
    log('Media WS: Connection accepted');
    new MediaStreamHandler(ws,mcache);
});

/**
 * Below code is used for control flow
 */

// Parse incoming POST params with Express middleware
app.use(urlencoded({ extended: false }));

// Create a route that will handle Twilio webhook requests, sent as an
// HTTP POST to /voice in our application
app.post('/twiml', (request, response) => {

    //log(request.body.CallerCountry);
    //log(request.body.Direction);
    //log(request.body.CallerState);
    //log(request.body.CallSid);
    //log(request.body.CallerZip);
    //log(request.body.From);
    //log(request.body.CalledCountry);
    //log(request.body.CallerCity);
    //log(request.body.Caller);

    log(JSON.stringify(request.body, null, 2));


    let callCache = mcache.get(request.body.CallSid);

    log("Cache value   !!!  "+JSON.stringify(callCache));
    if(typeof callCache === "undefined" || callCache === null){
        // Store in cache for 10 min
        log("Stored in cache!!!");
        mcache.put(request.body.CallSid, request.body);
    }





    // Use the Twilio Node.js SDK to build an XML response
    const twiml = new VoiceResponse();


    const gatherNode = twiml.gather({
        numDigits: 1,
        action: '/gather',
    });
    gatherNode.say({
        voice: 'woman',
        language: 'en-US'
    }, 'Welcome to Answers Intelligent Agent For Capital One. Press 1 for English or hang up when done');
    gatherNode.say({
        voice: 'woman',
        language: 'fr-FR'
    }, '\n' +
        'Bienvenue sur Answers Bot. Appuyez sur 2 pour le français!');
    gatherNode.say({
        voice: 'woman',
        language: 'es-ES'
    }, 'Bienvenido a Respuestas Bot. Presione 3 para español!');

    // If the user doesn't enter input, loop
    twiml.redirect('/twiml');

    // Render the response as XML in reply to the webhook request
    response.type('text/xml');
    response.send(twiml.toString());
});

// Create a route that will handle <Gather> input
app.post('/gather', (request, response) => {
    // Use the Twilio Node.js SDK to build an XML response
    const twiml = new VoiceResponse();
    let callCache = undefined;
    // If the user entered digits, process their request
    if (request.body.Digits) {
        switch (request.body.Digits) {
            case '1':
                twiml.say('Please ask your Question!');
                twiml.start().stream({url:"wss://77251b8d4ff5.ngrok.io/"});
                twiml.pause({length:1000});
                console.log(`Twiml Response: ${twiml.toString()} `);
                // Store Language of Choice
                callCache = mcache.get(request.body.CallSid);
                if(typeof callCache === "undefined" || callCache === null){
                    // Store in cache for 10 min
                    mcache.put(request.body.CallSid, request.body);
                }else{
                    callCache.Digits = request.body.Digits;
                    callCache.LanguageChosen = "en-US";
                    mcache.put(request.body.CallSid, callCache);
                }

                break;
            case '2':
                twiml.say('Vous avez sélectionné le français. Veuillez poser des questions!');
                // Store Language of Choice
                callCache = mcache.get(request.body.CallSid);
                if(typeof callCache === "undefined" || callCache === null){
                    // Store in cache for 10 min
                    mcache.put(request.body.CallSid, request.body);
                }else{
                    callCache.Digits = request.body.Digits;
                    callCache.LanguageChosen = "fr-FR";
                    mcache.put(request.body.CallSid, callCache);
                }

                break;
            case '3':
                twiml.say('Seleccionaste español. Por favor haga preguntas!');
                // Store Language of Choice
                callCache = mcache.get(request.body.CallSid);
                if(typeof callCache === "undefined" || callCache === null){
                    // Store in cache for 10 min
                    mcache.put(request.body.CallSid, request.body);
                }else{
                    callCache.Digits = request.body.Digits;
                    callCache.LanguageChosen = "es-ES";
                    mcache.put(request.body.CallSid, callCache);
                }

                break;
            default:
                twiml.say("Sorry, I don't understand that choice.").pause();
                twiml.redirect('/twiml');
                break;
        }
    } else {
        // If no input was sent, redirect to the /voice route
        twiml.redirect('/twiml');
    }

    // Render the response as XML in reply to the webhook request
    response.type('text/xml');
    response.send(twiml.toString());
});






// Create an HTTP server and listen for requests on port 3000
log(`Twilio Client app HTTP server running at http://127.0.0.1:${HTTP_SERVER_PORT}`);
//app.listen(HTTP_SERVER_PORT);
server.listen(HTTP_SERVER_PORT);

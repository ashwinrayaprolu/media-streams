"use strict";
require('dotenv').load();

const fs = require('fs');
const path = require('path');
const http = require('http');
const HttpDispatcher = require('httpdispatcher');
const WebSocketServer = require('websocket').server;
const TranscriptionService = require('./transcription-service');
const AnswersConnector = require('./answers-connector');

const accountSid = 'ACe86a004dc18c1e5423514b9e61133e48';
const authToken = '5ee700c90320c5e29afb4490ce800342';
const client = require('twilio')(accountSid, authToken);

const dispatcher = new HttpDispatcher();
const wsserver = http.createServer(handleRequest);
const stripHtml = require("string-strip-html");
const answersConnnector = new AnswersConnector();



const HTTP_SERVER_PORT = 8080;

function log(message, ...args) {
  console.log(new Date(), message, ...args);
}

const mediaws = new WebSocketServer({
  httpServer: wsserver,
  autoAcceptConnections: true,
});


function handleRequest(request, response){
  try {
    dispatcher.dispatch(request, response);
  } catch(err) {
    console.error(err);
  }
}

/**
 * Entry point for Twilio
 */



dispatcher.onPost('/twiml', function(req,res) {
  log('POST TwiML');

  var filePath = path.join(__dirname+'/templates', 'streams.xml');
  var stat = fs.statSync(filePath);

  res.writeHead(200, {
    'Content-Type': 'text/xml',
    'Content-Length': stat.size
  });

  var readStream = fs.createReadStream(filePath);
  readStream.pipe(res);


});

mediaws.on('connect', function(connection) {
  log('Media WS: Connection accepted');
  new MediaStreamHandler(connection);
});

/***
 *
 * Below code handles websocket media streams
 */
class MediaStreamHandler {
  constructor(connection) {
    this.metaData = null;
    this.trackHandlers = {};
    this.eventData  = {};
    connection.on('message', this.processMessage.bind(this));
    connection.on('close', this.close.bind(this));



  }

  processMessage(message){
    if (message.type === 'utf8') {
      const data = JSON.parse(message.utf8Data);
      if (data.event === "start") {
        this.metaData = data.start;
        log(message);
        console.log(`Starting Media Stream CallSID: ${data.start.callSid}`);
        console.log(`Starting Media Stream StreamSID: ${data.start.streamSid}`);
        this.eventData.callSid = data.start.callSid;
        this.eventData.streamSid = data.start.streamSid;


      }
      if (data.event !== "media") {
        log(` Standard Event ${data.event}`);
        return;
      }
      const track = data.media.track;

      //log(` Standard Event ${data.event}`);

      const that = this;

      if (this.trackHandlers[track] === undefined) {
        const service = new TranscriptionService();
        service.on('transcription', (transcription) => {
          log(`Transcription (${track}): ${transcription}`);

          log(`Call SID:     ${that.eventData.callSid}`);

          (async () => {
            let responseData = await answersConnnector.getAnswer(transcription);
            console.log(responseData);
            console.log(`After transcription CallSID: ${that.eventData.callSid}`);

            let responseToRender = "No response found please try some other query";
            if(typeof responseData.exactMatches != undefined && responseData.exactMatches.length >0 ){
              responseToRender = stripHtml(responseData.exactMatches[0].body).replace(/^(.{75}[^\s]*).*/, "$1"); ;

            }

            client.calls(that.eventData.callSid)
                .update({
                  twiml: `
                            <Response>
                                <Say>${responseToRender}</Say>
                                  <Pause length="1000"/>
                            </Response>
                    `
                })
                .then(call => console.log(call.to));

            console.log(`Complete updating callsid: ${that.eventData.callSid}`);
          })();





         /*
          client.calls('CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
              .update({twiml: '<Response><Say>Ahoy there</Say></Response>'})
              .then(call => console.log(call.to));
        */

          //log(`Call SID: ${client.call_sid}`);
          /*
          client.calls
              .create({
                twiml: '<Response><Say>Ahoy there!</Say></Response>',
                to: '+18334960878‬',
                from: '+17326667726'
              })
              .then(call => console.log(call.sid));

          */

        });
        this.trackHandlers[track] = service;
      }
      this.trackHandlers[track].send(data.media.payload);
      //this.trackHandlers[track].
    } else if (message.type === 'binary') {
      log('Media WS: binary message received (not supported)');
    }
  }

  close(){
    log('Media WS: closed');

    for (let track of Object.keys(this.trackHandlers)) {
      log(`Closing ${track} handler`);
      this.trackHandlers[track].close();
    }
  }
}

wsserver.listen(HTTP_SERVER_PORT, function(){
  console.log("Server listening on: http://localhost:%s", HTTP_SERVER_PORT);
});

/*
const interval = setInterval(function ping() {
  mediaws.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();

    ws.isAlive = false;
    ws.ping(noop);
  });
}, 30000);


 */
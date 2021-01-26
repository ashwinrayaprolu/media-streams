//var accountSid = 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'; // Your Account SID from www.twilio.com/console
//var authToken = 'your_auth_token';   // Your Auth Token from www.twilio.com/console

const testString = "open answers for td how can i pay my credit card";
const testString2 = "launch td how can i pay my credit card";
const testString3 = "ask tv. i want to get a credit card.";
const testString4 = "open query to td how can i pay my credit card";

const re = /^(ask|open|launch) (?<askphrase>.*) (for|to) (?<interface>\S*) (?<question>.*)$/i
const re2 = /^(ask|open|launch) (?<interface>\S*) (?<question>.*)$/i
const re3 = /^(ask|open|launch) (?<askphrase>.*)(\.)?\S(?<interface>\S*) (?<question>.*)$/i


const result = re.exec(testString);
const matchResult = re.test(testString);
console.log(matchResult);

if(result){
    result.forEach(function (value) {
        console.log(value);
    });
}



console.log("-------------------------------------------\n");

const result2 = re2.exec(testString2);
const matchResult2 = re2.test(testString2);
console.log(matchResult2);

if(result2){
    result2.forEach(function (value) {
        console.log(value);
    });
}



console.log("-------------------------------------------\n");

const result3 = re3.exec(testString3);
const matchResult3 = re3.test(testString3);
console.log(matchResult3);

if(result3){
    result3.forEach(function (value) {
        console.log(value);
    });
}

console.log("-------------------------------------------\n");

const result4 = re.exec(testString4);
const matchResult4 = re.test(testString4);
console.log(matchResult4);

if(result4){
    result4.forEach(function (value) {
        console.log(value);
    });
}


let contextObject = {
    context :{},
    request : {
        getKey: function(key){
            return "Value for "+key;
        }
    },
    response :{},
    crypto :{},
    title: 'test render'


}

const Freemarker = require('freemarker');

const freemarker = new Freemarker();

freemarker.render("<h1>${title} has val ${request.getKey('myVal')}</h1>", contextObject, (err, result) => {
    if (err) {
        throw new Error(err);
    }
    console.log(result);
});

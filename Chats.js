var mongoose = require('mongoose');
var Schema = mongoose.Schema;

mongoose.connect(process.env.DB);

const ChatSchema = new mongoose.Schema({
    username: { type: String },
    originText: { type: String },
    translatedText: { type:Map, of: String },
    timeStamp: { type:Date, default:Date.now }
})

module.exports = mongoose.model('Chat', ChatSchema);
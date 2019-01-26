const mongoose = require('mongoose');
require('mongoose-double')(mongoose)

const SchemaTypes = mongoose.Schema.Types
let deckSchema = new mongoose.Schema({
    name: String,
    winrate: SchemaTypes.Double,
    popularity: SchemaTypes.Double,
    screenshot: String
})

let dataPointSchema = new mongoose.Schema({
    timestamp: Date,
    decks: [deckSchema]
})

let DataPoint = mongoose.model('Data', dataPointSchema);

module.exports = DataPoint
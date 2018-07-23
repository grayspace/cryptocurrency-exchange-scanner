// This task will save results to firebase to be fetched by app.

'use-strict';
const firebase = require('firebase')
require('firebase/firestore')
const ccxt = require('ccxt')
//https://www.npmjs.com/package/technicalindicators
const ATR = require('technicalindicators').ATR // Average True Range
const ADX = require('technicalindicators').ADX // Average Directional Index
const CCI = require('technicalindicators').CCI // Commodity Channel Index

// Firebase setup (enter your own info)
const fbConfig = {
    apiKey: '',
    authDomain: '',
    databaseURL: '',
    projectId: '',
    storageBucket: ''
}
firebase.initializeApp(fbConfig)
var db = firebase.firestore()
var fbABResults = db.collection('ab-results')

// General params
const exchanges = ['hitbtc2', 'kucoin']
// supported exchanges - changes to params effect results (ex. binance volume is high)
//const exchanges = ['hitbtc2', 'kucoin', 'bittrex', 'cryptopia']
const quoteCurrencies = ['BTC', 'ETH', 'USD', 'USDT']
const verbose = false // Log all the details
// 24hr params
const minBTCVolume = 0.07
const minETHVolume = 0.95
const minUSDVolume = 650
const maxBTCVolume = 14
const maxETHVolume = 191
const maxUSDVolume = 130000
// 1hr params
const adxMaxTrendStrength = 40 // >25 is a trading range
const adxPeriod = 24
const atrMinPercentage = 5
const atrPeriod = 24
const minDiff = 20

    ; (async () => {
        var allPromiseResult = await Promise.all(exchanges.map(exchangeId =>
            new Promise(async (resolve, reject) => {
                let exchange = new ccxt[exchangeId]({ enableRateLimit: true, timeout: 30000, 'verbose': verbose })

                while (true) {
                    try {
                        var tickers = await exchange.fetchTickers()

                        for (var ticker in tickers) {
                            var coin = tickers[ticker]
                            var quoteCurrency = getQuoteCurrency(ticker)

                            if (quoteCurrencies.indexOf(quoteCurrency) > -1) {
                                var quoteVolume = coin.quoteVolume
                                var minQuoteVolume = getMinQuoteVolume(quoteCurrency)
                                var maxQuoteVolume = getMaxQuoteVolume(quoteCurrency)

                                if (quoteVolume && (quoteVolume >= minQuoteVolume) && (quoteVolume <= maxQuoteVolume)) {
                                    try {
                                        rateLimit = exchange.id == 'binance' ? exchange.rateLimit + 4000 : exchange.rateLimit
                                        await sleep(rateLimit)
                                        var now = exchange.seconds()
                                        var since = exchange.id == 'kucoin' || exchange.id == 'gateio' || exchange.id == 'bittrex' ? undefined : now - 172800 * 1

                                        // 1hr data
                                        const ohlcv = await exchange.fetchOHLCV(ticker, '1h', since) //since optional
                                        var index = ohlcv.length - 1

                                        // [ timestamp, open, high, low, close, volume ]
                                        const close = ohlcv[index][4]

                                        const openPrices = ohlcv.map(x => x[1])
                                        const highPrices = ohlcv.map(x => x[2])
                                        const lowPrices = ohlcv.map(x => x[3])
                                        const closePrices = ohlcv.map(x => x[4])

                                        const hasPastOHLCVData = (openPrices.length >= 24 || highPrices.length >= 24 || lowPrices.length >= 24 || closePrices.length >= 24) ? true : false

                                        if (close && hasPastOHLCVData) {
                                            var adxInput = { high: highPrices, low: lowPrices, close: closePrices, period: adxPeriod }
                                            var adxOutput = ADX.calculate(adxInput)
                                            var atrInput = { high: highPrices, low: lowPrices, close: closePrices, period: atrPeriod }
                                            var atrOutput = ATR.calculate(atrInput)
                                            var cciInput = { open: openPrices, high: highPrices, low: lowPrices, close: closePrices, period: atrPeriod }
                                            var cciOutput = CCI.calculate(cciInput)

                                            if (adxOutput.length > adxPeriod && atrOutput.length > atrPeriod) {
                                                var adx = adxOutput[adxOutput.length - 1].adx
                                                var adxBelowMax = adx && adx <= adxMaxTrendStrength ? true : false
                                                var atr = atrOutput[atrOutput.length - 1]
                                                var atrPercent = (atr / close) * 100
                                                var atrAboveMin = atr && atrPercent > atrMinPercentage ? true : false

                                                if (adxBelowMax && atrAboveMin) {
                                                    //var pdi = adxOutput[adxOutput.length - 1].pdi
                                                    //var mdi = adxOutput[adxOutput.length - 1].mdi
                                                    //var adxDirection = pdi > mdi ? "U" : pdi == mdi ? "F" : "D"
                                                    //var rsi = rsiOutput[rsiOutput.length - 1]
                                                    var cci = cciOutput[cciOutput.length - 1]

                                                    var recentHighs = highPrices.slice(-20).filter(Number)
                                                    var recentLows = lowPrices.slice(-20).filter(Number)
                                                    var maxHigh = Math.max(...recentHighs)
                                                    var minLow = Math.min(...recentLows)
                                                    var diff = (maxHigh - minLow) / minLow * 100

                                                    if (diff >= minDiff) {
                                                        var coinDoc = {
                                                            ticker: ticker,
                                                            exchange: getExchangeName(exchange.id),
                                                            link: getLink(exchange.id, ticker),
                                                            quoteVolume24hr: quoteVolume,
                                                            adx: adx,
                                                            atr: atr,
                                                            atrPercent: atrPercent,
                                                            cci: cci,
                                                            diff: diff,
                                                            dateAdded: new Date()
                                                        }
                                                        console.log(ticker, ' - ', coinDoc.exchange, ' -  Diff:', coinDoc.diff.toFixed(2) + '%  -  ADX: ', adx.toFixed(2), ' -  ATR:', atrPercent.toFixed(2) + '%  -  CCI:', cci.toFixed(2))
                                                        saveToFirestore(ticker, coinDoc)
                                                    } //end if meets diff cond

                                                } //end if meets adx and atr cond
                                            }
                                        }
                                    } catch (e) {
                                        console.log('Error: ', e.constructor.name, ' - ', e.message)
                                    }
                                }
                            }
                        } //end for tickers
                    } catch (e) {
                        console.log('Error: ', e.constructor.name, ' - ', e.message)
                    }
                } //end while
            }) //end promise exchange
        )) //end promise all
        console.log('Result: ', allPromiseResult)
    })().catch(() => { console.log('Async catch.') }) //end async


let deleteOldRecords = function () {
    var date = new Date()
    var query = fbABResults.where('dateAdded', '<', addHours(date, -6)).get().then((docSnapshot) => {
        if (docSnapshot.empty == false) {
            docSnapshot.docs.forEach(function (doc) {
                fbABResults.doc(doc.id).delete().then(function () {
                    console.log('Deleted old record. ID: ', doc.id)
                }).catch(function () {
                    console.log('Failed to delete old record.')
                })
            })
        }
    })
}

let saveToFirestore = function (ticker, coinDoc) {
    var query = fbABResults.where('ticker', '==', ticker).get().then((docSnapshot) => {

        if (docSnapshot.empty == false) {
            var doc = docSnapshot.docs[0]
            var nowSeconds = Math.floor(Date.now() / 1000)
            var pastSeconds = Math.floor(doc.data().dateAdded / 1000)

            if (pastSeconds < nowSeconds - 10800) {
                // 3 hours since last update, delete
                fbABResults.doc(doc.id).delete().then(function () {
                    // and add again
                    fbABResults.add(coinDoc).then(function (docRef) {
                        console.log('Coin updated: ', ticker, docRef.id)
                    }).catch(function (error) {
                        console.log('Failed to add doc. Error: ', error)
                    })
                }).catch(function (error) {
                    console.log('Failed to delete duplicate doc. Error: ', error)
                })
            }
        } else {
            fbABResults.add(coinDoc).then(function (docRef) {
                console.log('New coin added: ', ticker, docRef.id)
            }).catch(function (error) {
                console.log('Failed to add doc. Error: ', error)
            })
        }
    })
}

let getExchangeName = function (exchange) {
    if (exchange == 'hitbtc2' || exchange == 'hitbtc') {
        return 'HitBTC'
    } else if (exchange == 'kucoin') {
        return 'KuCoin'
    } else if (exchange == 'bittrex') {
        return 'Bittrex'
    } else if (exchange == 'cryptopia') {
        return 'Cryptopia'
    } else if (exchange == 'binance') {
        return 'Binance'
    } else {
        console.log('Exchange name format failed.')
        return 'Not found'
    }
}

let getLink = function (exchange, ticker) {
    if (exchange == 'hitbtc2' || exchange == 'hitbtc') {
        return '<a href="https://hitbtc.com/' + ticker.replace('/', '-to-') + '" target="_blank">' + ticker + '</a>'
    } else if (exchange == 'kucoin') {
        return '<a href="https://www.kucoin.com/#/trade.pro/' + ticker.replace('/', '-') + '" target="_blank">' + ticker + '</a>'
    } else if (exchange == 'bittrex') {
        var parts = ticker.split('/')
        var base = parts[0]
        var quote = parts[1]
        return '<a href="https://bittrex.com/Market/Index?MarketName=' + quote + '-' + base + '" target="_blank">' + ticker + '</a>'
    } else if (exchange == 'cryptopia') {
        return '<a href="https://www.cryptopia.co.nz/Exchange/?market=' + ticker.replace('/', '_') + '" target="_blank">' + ticker + '</a>'
    } else if (exchange == 'binance') {
        return '<a href="https://www.binance.com/trade.html?symbol=' + ticker.replace('/', '_') + '" target="_blank">' + ticker + '</a>'
    } else {
        console.log('Exchange URL format failed.')
        return 'Not found'
    }
}

let addHours = function (date, hours) {
    return date.setTime(date.getTime() + (hours * 60 * 60 * 1000))
}

let getDate = function () {
    var today = new Date();
    var dd = today.getDate();
    var mm = today.getMonth() + 1; //January is 0!
    var yyyy = today.getFullYear();
    var time = today.toLocaleTimeString();
    if (dd < 10) {
        dd = '0' + dd
    }
    if (mm < 10) {
        mm = '0' + mm
    }
    return today = mm + '/' + dd + '/' + yyyy + ' ' + time;
}

let getMinQuoteVolume = function (quoteCurrency) {
    return quoteCurrency === 'ETH' ? minETHVolume
        : quoteCurrency === 'BTC' ? minBTCVolume
            : quoteCurrency === 'USD' || quoteCurrency === 'USDT' ? minUSDVolume
                : 0
}

let getMaxQuoteVolume = function (quoteCurrency) {
    return quoteCurrency === 'ETH' ? maxETHVolume
        : quoteCurrency === 'BTC' ? maxBTCVolume
            : quoteCurrency === 'USD' || quoteCurrency === 'USDT' ? maxUSDVolume
                : 0
}

let getQuoteCurrency = function (ticker) {
    var qc = ticker.split('/')
    return qc[1]
}

let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// This task will send an email when TA criteria is met.

'use-strict';
const ccxt = require('ccxt')
const nodemailer = require('nodemailer')
//https://www.npmjs.com/package/technicalindicators
const SMA = require('technicalindicators').SMA
const ATR = require('technicalindicators').ATR
const ADX = require('technicalindicators').ADX

//const asciichart = require('asciichart')

// 1hr params
const maxPercentChange = -10
const minHammerSize = 4 // tail >= 3x body
const checkGoldenHammerAboveSMA = false
const adxMaxTrendLimit = 35
const minATRPercentage = 25

// 24hr params
const minETHVolume = 17
const minBTCVolume = 1
const minUSDVolume = 6900

let hitbtc = new ccxt.hitbtc2()

    ; (async function main() {
        var bigDipResults = []
        var bigHammerResults = []
        var goldenHammerResults = []
        var accountBuilderResults = []

        // Get exchange pair data
        var tickers = await hitbtc.fetchTickers()
        await sleep(hitbtc.rateLimit)

        for (var ticker in tickers) {
            // 24hr data
            var quoteVolume = tickers[ticker].quoteVolume
            var quoteCurrency = getQuoteCurrency(ticker)
            var minVolume = getMinQuoteVolume(quoteCurrency)

            if (quoteVolume && (quoteVolume >= minVolume)) {
                // 1hr data
                await sleep(hitbtc.rateLimit)
                const ohlcv = await hitbtc.fetchOHLCV(ticker, '1hr')

                // OHLCV Indexes 
                //0 - timestamp
                //1 - open
                //2 - high
                //3 - low
                //4 - close
                //5 - volume
                const hrOpen = ohlcv[ohlcv.length - 1][1]
                const hrClose = ohlcv[ohlcv.length - 1][4]
                const hrHigh = ohlcv[ohlcv.length - 1][2]
                const hrLow = ohlcv[ohlcv.length - 1][3]
                const vol = ohlcv[ohlcv.length - 1][5]
                var percentChange = calculatePercentage(hrOpen, hrClose)
                var priceDifferenceOK = checkPriceDifference(hrOpen, hrClose)

                // Check prev 3 periods
                const hrOpen2 = ohlcv[ohlcv.length - 2][1]
                const hrClose2 = ohlcv[ohlcv.length - 2][4]
                const hrOpen3 = ohlcv[ohlcv.length - 3][1]
                const hrClose3 = ohlcv[ohlcv.length - 3][4]
                const hrOpen4 = ohlcv[ohlcv.length - 4][1]
                const hrClose4 = ohlcv[ohlcv.length - 4][4]
                var previous3PeriodsRed = false

                if ((hrClose2 < hrOpen2) && (hrClose3 < hrOpen3) && (hrClose4 < hrOpen4)) {
                    previous3PeriodsRed = true
                }

                // Get prices for TA calcs
                const highPrices = ohlcv.map(x => x[2])
                const lowPrices = ohlcv.map(x => x[3])
                const closePrices = ohlcv.map(x => x[4])

                // Check if above a moving average
                const maPeriod = 50
                SMA.calculate({ period: maPeriod, values: closePrices })
                var sma = new SMA({ period: maPeriod, values: [] })
                var smaResults = []
                closePrices.forEach(price => {
                    var result = sma.nextValue(price)
                    if (result)
                        smaResults.push(result)
                })
                const lastSMAClose = smaResults[smaResults.length - 1]
                const closeAboveSMA = hrClose > lastSMAClose ? true : false

                // Check for higher volume than prev bar
                const vol2 = ohlcv[ohlcv.length - 2][5]

                var body = hrOpen - hrClose
                var lowerShadow = hrClose - hrLow
                var upperShadow = hrHigh - hrOpen

                // Check for big hammers
                var isHammer = false
                if (lowerShadow != 0
                    && body != 0
                    && ((lowerShadow / body) >= minHammerSize)
                    && (lowerShadow > upperShadow)) {
                    isHammer = true
                }

                // Check for golden hammers
                var isGoldenHammer = false
                // toggle check above SMA (see params)
                if (checkGoldenHammerAboveSMA) {
                    if (isHammer && previous3PeriodsRed && closeAboveSMA && vol2 > vol) {
                        isGoldenHammer = true
                    }
                } else {
                    if (isHammer && previous3PeriodsRed && vol2 > vol) {
                        isGoldenHammer = true
                    }
                }

                // Check for account builders
                const adxPeriod = 14
                var adxInput = { high: highPrices, low: lowPrices, close: closePrices, period: adxPeriod }
                var adx = ADX.calculate(adxInput)
                var adxBelowTrendLimit = adx && (adx[adx.length - 1].adx <= adxMaxTrendLimit) ? true : false

                const atrPeriod = 14
                var atrInput = { high: highPrices, low: lowPrices, close: closePrices, period: atrPeriod }
                var atr = ATR.calculate(atrInput)
                var atrPercent = (atr[atr.length - 1] / hrClose) * 100
                var adrAboveMin = atr && (atrPercent > minATRPercentage) ? true : false

                // Add account builders to results
                var isAccountBuilder = false
                if (priceDifferenceOK && adxBelowTrendLimit && adrAboveMin) {
                    accountBuilderResults.push({ ticker: ticker, percentChange: percentChange, quoteVolume: quoteVolume.toFixed(3), open: hrOpen.toFixed(7), close: hrClose.toFixed(7), change: (hrClose - hrOpen).toFixed(7) })
                    console.log('Account Builder found for ' + ticker + ', O:' + hrOpen + ', C:' + hrClose + ', L:' + hrLow + ', %:' + percentChange)
                }

                //TODO: Check for bases

                // Send golden hammer emails immediately
                if (isGoldenHammer) {
                    goldenHammerResults.push({ ticker: ticker, percentChange: percentChange, quoteVolume: quoteVolume.toFixed(3), open: hrOpen.toFixed(7), close: hrClose.toFixed(7), change: (hrClose - hrOpen).toFixed(7) })
                    console.log('Golden Hammer found for ' + ticker + ', O:' + hrOpen + ', C:' + hrClose + ', L:' + hrLow + ', %:' + percentChange)
                }

                // Add big hammers to results
                if (isHammer && !isGoldenHammer) {
                    bigHammerResults.push({ ticker: ticker, percentChange: percentChange, quoteVolume: quoteVolume.toFixed(3), open: hrOpen.toFixed(7), close: hrClose.toFixed(7), change: (hrClose - hrOpen).toFixed(7) })
                    console.log('Hammer found for ' + ticker + ', O:' + hrOpen + ', C:' + hrClose + ', L:' + hrLow + ', %:' + percentChange)
                }

                // Add big dips to results
                if (percentChange <= maxPercentChange && priceDifferenceOK && (percentChange != 0 && percentChange != NaN)) {
                    bigDipResults.push({ ticker: ticker, percentChange: percentChange, quoteVolume: quoteVolume.toFixed(3), open: hrOpen.toFixed(7), close: hrClose.toFixed(7), change: (hrClose - hrOpen).toFixed(7) })
                    console.log('Dip found for ' + ticker + ', O:' + hrOpen + ', C:' + hrClose + ', L:' + hrLow + ', %:' + percentChange)
                }
            }
        }

        // Sort by percent change
        bigDipResults.sort((a, b) => { return a.percentChange - b.percentChange })
        bigHammerResults.sort((a, b) => { return a.percentChange - b.percentChange })
        goldenHammerResults.sort((a, b) => { return a.percentChange - b.percentChange })
        accountBuilderResults.sort((a, b) => { return a.percentChange - b.percentChange })

        // Send email
        var subject = 'Scanner Results (1hr) - ' + getDate()

        var html = '<h3>Account Builders</h3>'
        if (accountBuilderResults.length < 1) {
            html += 'No account builders found :('
        } else
            html += formatListData(accountBuilderResults)

        html += '<h3>Golden Hammers</h3>'
        if (goldenHammerResults.length < 1) {
            html += 'No golden hammers found :('
        } else
            html += formatListData(goldenHammerResults)

        html += '<h3>Hammers</h3>'
        if (bigHammerResults.length < 1) {
            html += 'No hammers found :('
        } else
            html += formatListData(bigHammerResults)

        html += '<h3>Big Dips</h3>'
        if (bigDipResults.length < 1) {
            html += 'No dips found :('
        } else
            html += formatListData(bigDipResults)

        html += '<p>What is my system? What is my edge?</p>'
        sendEmail(subject, html)
    })()


let sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

let calculatePercentage = function (open, close) {
    return ((close - open) / open * 100).toFixed(2)
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

let checkPriceDifference = function (open, close) {
    // Checks for changes like 0.0001
    var openNumZeros = -Math.floor(Math.log(open) / Math.log(10) + 1)
    var closeNumZeros = -Math.floor(Math.log(close) / Math.log(10) + 1)
    if (openNumZeros === closeNumZeros) {
        var openDecVal = Number((open + '').split('.')[1])
        var closeDecVal = Number((close + '').split('.')[1])
        if (openNumZeros > 3 && ((openDecVal - closeDecVal) <= 1 || (closeDecVal - openDecVal) <= 1)) {
            return false
        } else if (openNumZeros > 5) {
            return false
        } else {
            return true
        }
    } else {
        return true
    }
}

let getQuoteCurrency = function (ticker) {
    var qc = ticker.split('/')
    return qc[1]
}

let getMinQuoteVolume = function (quoteCurrency) {
    return quoteCurrency === 'ETH' ? minETHVolume
        : quoteCurrency === 'BTC' ? minBTCVolume
            : quoteCurrency === 'USD' || quoteCurrency === 'USDT' ? minUSDVolume
                : 0
}

let formatListData = function (results) {
    var html = 'Pair | <b>% Change</b> | <b>24hr Volume</b> <br/> Open | Close | Change'
    for (var ticker in results) {
        var link = getLink(results[ticker].ticker)
        var quoteCurrency = getQuoteCurrency(results[ticker].ticker)
        html += '<p>' + link +
            ' | <b>' + results[ticker].percentChange +
            '%</b> | <b>' + results[ticker].quoteVolume +
            ' ' + quoteCurrency +
            '</b><br/>' + results[ticker].open +
            ' | ' + results[ticker].close +
            ' | ' + results[ticker].change +
            '</p>'
    }
    return html
}

let getLink = function (ticker) {
    var link = '<a href="https://hitbtc.com/' + ticker.replace("/", "-to-") + '">' + ticker + '</a>'
    return link
}

// Enter your own info
let sendEmail = function (subject, html) {
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: '',
            pass: ''
        }
    })
    var mailOptions = {
        from: '',
        to: '',
        subject: subject,
        html: html
    }
    transporter.sendMail(mailOptions).then(function (info) {
        console.log(info)
        process.exit();
    }).catch(function (err) {
        console.log(err)
    })
}


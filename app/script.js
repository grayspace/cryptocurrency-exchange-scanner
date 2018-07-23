var table = $('#table');
var chkScannerOn = $("#chk-scanner-on");
var btnAutoFilter = $("#btn-auto-filter");
var scannerOn = true;
var autoFilterOn = false;

btnAutoFilter.click(function() {
  if (autoFilterOn) {
    btnAutoFilter.css({
      backgroundColor: 'white'
    });
    autoFilterOn = false;
    table.bootstrapTable('load', coins);
  } else {
    btnAutoFilter.css({
      backgroundColor: '#6BA583'
    });
    autoFilterOn = true;
    var filteredCoins = coins.filter(autoFilterItem);
    table.bootstrapTable('load', filteredCoins);
  }
});

// Firebase
var config = {
  apiKey: 'AIzaSyAW6uoO3ZBj8kDaR8jiguHm4zQN7b9bpGI',
  authDomain: 'cescanner-cdb59.firebaseapp.com',
  databaseURL: 'https://cescanner-cdb59.firebaseio.com',
  projectId: 'cescanner-cdb59',
  storageBucket: 'cescanner-cdb59.appspot.com',
  messagingSenderId: "",
};

firebase.initializeApp(config);
var db = firebase.firestore();
buildTable();
var loaded = false;
var lastUpdateTime = null;
var countCoinsLastLoad = 0;
var coins = [];

db.collection("ab-results").onSnapshot(function(querySnapshot) {
  if ($("#chk-scanner-on").is(":checked")) {
    if (querySnapshot.size > countCoinsLastLoad) {
      coins = [];
      querySnapshot.forEach(function(doc) {
        coins.push(doc.data());
      });
      fillTable(coins);
    }
    countCoinsLastLoad = querySnapshot.size;
  }
});

function buildTable() {
  var sortBy = autoFilterOn ? 'atrPercent' : 'dateAdded';
  table.bootstrapTable({
    columns: [{
        field: 'link',
        title: 'Mkt',
        sortable: 'true',
        titleTooltip: 'Click link to open coin on exchange.',
        class: 'link'
      }, {
        field: 'exchange',
        title: 'Exch',
        sortable: 'true',
        titleTooltip: 'Exchange where coin was found by scanner.'
      }, {
        field: 'diff',
        title: 'Diff%',
        sortable: 'true',
        titleTooltip: 'Percentage difference between highest high and lowest low for last 24 bars.',
        formatter: formatDecimal
      },
      //{
      //field: 'atrPercent',
      //title: 'ATR%',
      //sortable: 'true',
      //titleTooltip: 'Average True Range % indicates level of price volatility as a percentage.',
      //formatter: formatDecimal
      //},
      {
        field: 'adx',
        title: 'ADX',
        sortable: 'true',
        titleTooltip: 'Average Directional Index indicates level of trend stength. Below 25 is considered a trading range.',
        formatter: formatDecimal
      },
      //{
      //  field: 'adxDir',
      //  title: 'Dir',
      //  sortable: 'true',
      //  titleTooltip: 'The direction of the trend based on ADX.'
      //}, 
      //{
      //field: 'quoteVolume24hr',
      //title: 'V',
      //sortable: 'true',
      //titleTooltip: 'The 24 hour volume of the quote currency (last of the two).',
      //formatter: formatDecimal
      //},
      {
        field: 'cci',
        title: 'CCI',
        sortable: 'true',
        titleTooltip: 'Commodity Channel Index. Above 100 indicates overbought, below -100 indicates oversold',
        formatter: formatDecimal
      }, {
        field: 'dateAdded',
        title: 'Date',
        sortable: 'true',
        titleTooltip: 'Date/time when coin was found by scanner.',
        formatter: formatDate
      }
    ],
    sortName: 'dateAdded',
    sortOrder: 'desc',
    pagination: true,
    pageSize: 50,
    search: true,
    showToggle: true,
    cellStyle: cellStyle,
    classes: 'table-no-bordered',
    icons: {
      toggle: 'glyphicon-list-alt icon-list-alt',
      detailOpen: 'glyphicon-plus icon-plus',
      detailClose: 'glyphicon-minus icon-minus'
    },
    toolbar: '#toolbar',
    //detailView: true,
    //detailFormatter: formatDetails
  });
}

function cellStyle(value, row, index, field) {
  return {
    css: {
      "padding": "5px"
    }
  };
}

//TODO: Refresh table when scanner turned back on

function fillTable(coins) {
  var nowSeconds = Math.floor(Date.now() / 1000);
  if (loaded && lastUpdateTime && nowSeconds > Math.floor(lastUpdateTime / 1000) + 0.5) {
    if ($("#chk-sound-on").is(":checked")) {
      var alertSound = new Audio('https://firebasestorage.googleapis.com/v0/b/cescanner-cdb59.appspot.com/o/ambient.mp3?alt=media&token=d6ced90d-79e0-447e-9929-15547ef106f5');
      alertSound.play();
    }
  }

  table.bootstrapTable('load', coins);
  loaded = true;
  lastUpdateTime = new Date();
}

function formatDecimal(value, row, index, field) {
  return value.toFixed(2);
}

function formatDecimalLong(value, row, index, field) {
  return value.toFixed(8);
}

function formatDate(value, row, index, field) {
  return value.toLocaleDateString() + ' ' + value.toLocaleTimeString();
}

function autoFilterItem(item) {
  var diffMin = item.exchange == "KuCoin" ? 20 : 25;
  var cciMax = item.exchange == "KuCoin" ? -30 : -100;
  if (item.adx <= 30 && item.diff >= diffMin && item.cci <= cciMax) {
    return true;
  }
  return false;
}
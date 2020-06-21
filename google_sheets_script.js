const OVERRIDE_OPT = 'WARN' // options: ALLOW, WARN, FORBID
const SEND_TO_SLACK = false // options: true or false
const WARN_IF_NO_CHECK_OUT = false // options: true or false
const CHECK_IN_CHANNEL = "#lab-check-in-log" //change this to what your desired channel is called
const url = "https://hooks.slack.com/services/XXXX/XXX"; //put your webhook url here

const BLUE = "alanine"
const RED = "tyrosine"
const YELLOW = "leucine"
const GREEN = "proline"
const PURPLE = "glutamine"
var stations = [BLUE, RED, YELLOW, GREEN, PURPLE]
const NUM_SHIFTS = 4

const BLUE_COL = 2
const RED_COL = 5
const YELLOW_COL = 8
const GREEN_COL = 11
const PURPLE_COL = 14
const COLS = [BLUE_COL, RED_COL, YELLOW_COL, GREEN_COL, PURPLE_COL]

//shift check-out times (only needed if WARN_IF_NO_CHECK_OUT is true)
const CHECKOUT_1 = 13
const CHECKOUT_2 = 18
const CHECKOUT_3 = 23
const CHECKOUT_TIMES = [CHECKOUT_1, CHECKOUT_2, CHECKOUT_3]

const CHECK_IN_COMMAND = "/check-in"
const CHECK_OUT_COMMAND = "/check-out"
const SHEET_NAME = "Event Log"
const SHEET_CURR_DAY = "Current Day"
const CHECK_IN_ACTION = "Check In"
const CHECK_OUT_ACTION = "Check Out"
const NO_CHECK_OUT_ACTION = "No Checkout"
const ROW_OFFSET = 2

function doPost(e) {
  if (typeof e !== 'undefined') {
    switch (e.parameter.command) {
      case CHECK_IN_COMMAND:
        return handleCheckIn(e);
      case CHECK_OUT_COMMAND:
        return handleCheckOut(e);
      default:
        return ContentService.createTextOutput('Unknown command');
    }
  }
}

function noCheckOut() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow()
  if (WARN_IF_NO_CHECK_OUT) {
    var checkOutHour = new Date().toTimeString().split(' ')[0].split(':')[0]
    var i;
    for (i = 0; i < CHECKOUT_TIMES.length - 1; i++) {
      if (checkOutHour >= CHECKOUT_TIMES[i] && checkOutHour < CHECKOUT_TIMES[i + 1]) {
        var row = i + 1 + ROW_OFFSET
        break
      } else {
        var row = CHECKOUT_TIMES.length + ROW_OFFSET
      }
    }
    //check all cells of that row
    for (i in COLS) {
      var col = COLS[i]
      if (sheet_curr_day.getRange(row, col + 2, 1, 1).isBlank() && !sheet_curr_day.getRange(row, col + 1, 1, 1).isBlank()) {
        var action = "No Checkout"
        var name = sheet_curr_day.getRange(row, col, 1, 1).getValue()
        var time = sheet_curr_day.getRange(row, col + 1, 1, 1).getValue()
        var shift = row - ROW_OFFSET
        var details = ['', action, name, stations[i], shift]
        sendToSlack(details)
      }
    }
  }
}

function autoClear(a) {
  // set up spreadsheet
  var col = 2
  var row_old = 3
  var row_new = row_old + 7 
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow()
  
  // copy previous day down
  var row_num = stations.length * 3
  var old_range = sheet_curr_day.getRange(row_old, col, NUM_SHIFTS, row_num)
  var new_range = sheet_curr_day.getRange(row_new, col, NUM_SHIFTS, row_num)
  old_range.moveTo(new_range)
  
  //update dates
  var old_date = sheet_curr_day.getRange(1, 1, 1, 1).getValue()
  sheet_curr_day.getRange(8, 1, 1, 1).setValue(old_date)
  var new_date = new Date().toDateString()
  sheet_curr_day.getRange(1, 1, 1, 1).setValue(new_date)
  
  
}


function handleCheckIn(e) {
  // set up spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow()
  var action = CHECK_IN_ACTION
  
  // extract data from slack request
  var parameter = e.parameter;
  var args = parameter.text.split(" "); 
  if (args.length != 3) {
    return ContentService.createTextOutput('/check-in expects 3 arguments: [Name] [Station] [Shift Number]');
  }
  [name, station, shift] = extractArgs(args)
  
  errorMsg = validateArgs(name, station, shift)
  if (errorMsg) {
    return errorMsg
  }
  
  column = getStationColumn(station)
  if (!column) {
    return ContentService.createTextOutput('Something is wrong with your station');
  }
  
  var row = shift + ROW_OFFSET
  
  var in_name = sheet_curr_day.getRange(row, column, 1, 1).getValue()  
  var return_text = ''
  var update_override = true
  if ( name.toLowerCase() != in_name.toLowerCase() && in_name != '') {
    switch(OVERRIDE_OPT){
      case 'ALLOW':
        return_text =':female-scientist: Have a great day in Lab! :tada:';
        break;
      case 'WARN':
        return_text = `You overrode ${in_name}\'s check in to this station. Please check the schedule and make sure this is correct`;
        break;
      case 'FORBID':
        return_text = `You cannot check into this station because ${in_name} is checked in.`;
        update_override = false
        break
      default:
        return_text ='default text';
        break
    }
  } else {
    return_text =':female-scientist: Have a great day in Lab! :tada:'
  }
  
  var checkInTime = new Date().toTimeString().split(' ')[0];
  var date = new Date().toDateString()
  var checkInDetails = [date, action, name, station, shift, checkInTime]
  var checkInDetailsCondensed = [name, checkInTime]
  
  column = getStationColumn(station)
  if (!column) {
    return ContentService.createTextOutput('Something is wrong with your station');
  }
  
  if (update_override) {
    sheet.getRange(lastRow + 1, 1, 1, 6).setValues([checkInDetails])
    sheet_curr_day.getRange(row, column, 1, 2).setValues([checkInDetailsCondensed])
    if (SEND_TO_SLACK) {
      sendToSlack(checkInDetails)
    }
  }
  return ContentService.createTextOutput(return_text);
}

function handleCheckOut(e) {
  // set up spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow()
  var action =  CHECK_OUT_ACTION
  
  // extract data from slack request
  var parameter = e.parameter;
  var args = parameter.text.split(" ");
  if (args.length != 3) {
    return ContentService.createTextOutput('/check-out expects 3 arguments: [Name] [Station] [Shift Number]');
  }
  [name, station, shift] = extractArgs(args)
  
  errorMsg = validateArgs(name, station, shift)
  if (errorMsg) {
    return errorMsg
  }
  
  column = getStationColumn(station)
  if (!column) {
    return ContentService.createTextOutput('Something is wrong with your station');
  }
  
  var row = shift + ROW_OFFSET
  
  //Alert User if their name does not match the name they are trying to check-out
  var in_name = sheet_curr_day.getRange(row, column, 1, 1).getValue()
  if (in_name == '') {
    in_name = 'no one'
  }
  if ( name.toLowerCase() != in_name.toLowerCase() ) {
    var errmsg = `You cannot check out of this station because ${in_name} is currently checked in. Double check your name spelling, station and shift number`;
    return ContentService.createTextOutput(errmsg);
  }
  
  
  // Write to the History sheet and Current Day Sheet
  var checkOutTime = new Date().toTimeString().split(' ')[0];
  var day = new Date().toDateString()
  
  var checkOutDetails = [day, action, name, station, shift, checkOutTime]
  var checkOutDetailsCondensed = [checkOutTime]
  
  sheet.getRange(lastRow + 1, 1, 1, 6).setValues([checkOutDetails])
  sheet_curr_day.getRange(row, column + 2, 1, 1).setValues([checkOutDetailsCondensed])
  
  if (SEND_TO_SLACK) {
    sendToSlack(checkOutDetails)
  }
  
  return ContentService.createTextOutput(':wave: See you next time! :tada:');
}


function getStationColumn(station) {
  var i;
  for (i = 0; i < stations.length; i++) {
    if (station == stations[i]) {
      return COLS[i]
    }
  }
  return null
}

function extractArgs(args) {
  var name = args[0]
  var station = args[1].toLowerCase()
  var shift = parseInt(args[2])
  
  return [name, station, shift]
}

function validateArgs(name, station, shift) {
  // Alert user if station is not in the list of stations
  if (!stations.includes(station)) {
    return ContentService.createTextOutput('Station must be one of: \n' + stations.join(' '));
  }
  
  // Alert user if shift is not valid
  if (shift > NUM_SHIFTS || shift < 1) {
    var msg = "Shift must be between 1 and " + NUM_SHIFTS
    return ContentService.createTextOutput(msg);
  }
  return null
}

// function to send message to Slack
// checkOutDetails = [day, action, name, station, shift, checkOutTime]
function sendToSlack(details) {
  var timestamp = new Date();

  if ( details[1] == CHECK_IN_ACTION ) {
    var payload = {
    "channel": CHECK_IN_CHANNEL,
    "username": "Check-In Bot",
    "text": details[2] + " has checked in to " + details[3] + " for shift number " + details[4]
    };
  } else if ( details[1] == CHECK_OUT_ACTION ) {
    var payload = {
    "channel": CHECK_IN_CHANNEL,
    "username": "Check-In Bot",
    "text": details[2] + " has checked out of " + details[3] + " for shift number " + details[4]
    };
   } else if ( details[1] == NO_CHECK_OUT_ACTION ) {
    var payload = {
    "channel": CHECK_IN_CHANNEL,
    "username": "Check-In Bot",
      "text": ":bangbang: WARNING :bangbang: " + details[2] + " has NOT checked out of station " + details[3] + " for shift number " + details[4] + ", make sure they are okay."
    };
  } else {
    var payload = {
    "channel": CHECK_IN_CHANNEL,
    "username": "Check-In Bot",
    "text": "Please contact Sophie if you see this. What is in the details: " + details
    };
  }
  
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload)
  };
  
  return UrlFetchApp.fetch(url,options);
}



// This script was created by Sophie Shoemaker Updated: 06/20/2020 




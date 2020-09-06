const OVERRIDE_OPT = 'WARN' // options: ALLOW, WARN, FORBID
const SEND_TO_SLACK = true // options: true or false
const WARN_IF_NO_CHECK_OUT = true // options: true or false
const CHECK_IN_CHANNEL = "#check-in-log" //change this to what your desired channel is called
const url = "https://hooks.slack.com/services/xx"; //put your webhook url here


// Main Commands
const CHECK_IN_COMMAND = "/check-in"
const CHECK_OUT_COMMAND = "/check-out"
const SHEET_NAME = "Event Log"
const SHEET_CURR_DAY = "Current Day"
const CHECK_IN_ACTION = "Check In"
const CHECK_OUT_ACTION = "Check Out"
const NO_CHECK_OUT_ACTION = "No Checkout"
const ROW_OFFSET = 2
const LAB_TOTAL = 10  //Edit number of people in lab (or that you want to keep track of)
const LAB_LIMIT = 4   //Edit number to max allowed people in lab at one time


// Personnel variables
const PERSON01 = "name_01"//Must edit these with the names exactly has they appear on the google sheet
const PERSON02 = "name_02"
const PERSON03 = "name_03"
const PERSON04 = "name_04"
const PERSON05 = "name_05"
const PERSON06 = "name_06"
const PERSON07 = "name_07"
const PERSON08 = "name_08"
const PERSON09 = "name_09"
const PERSON10 = "name_10"
const NAME_ERR = "Error: Name must be name_01, name_02, name_03, name_04, name_05, name_06, name_07, name_08, name_09 or name_10"



function liveCount(numIN) {
  //Count the number of researchers currently in lab  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);  
  var numIN = 0;
  var rowMin = 1 + ROW_OFFSET
  var rowMax = LAB_TOTAL + ROW_OFFSET  
  var i;
  for(i = rowMin; i<= rowMax;i++) {
    var inCount = sheet_curr_day.getRange(i, 2).getValue();
    //Logger.log('inCount = %s',inCount)
    if (inCount == "In") {
      numIN += 1      
    }
  }
  Logger.log('Just finished counting %d',numIN)
  return numIN
}

function receiveCount(numIN) {
  var numIN;
  numIN = liveCount([numIN]); //Call liveCount to obtain current numIN
  Logger.log ('Num in Lab = %d', numIN);  
}



function noCheckOut() {
  //Assumes a single shift and that all researchers will depart 3 AM EST
  //This script is executed by a trigger function at 3 AM EST
  var numIN = 0;
  var msg = "";
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow()
  if (WARN_IF_NO_CHECK_OUT) {   
    var rowMin = 1 + ROW_OFFSET
    var rowMax = LAB_TOTAL + ROW_OFFSET  
    var i
    for( i = rowMin; i<= rowMax;i++ ) {
      if ( sheet_curr_day.getRange(i, 4, 1, 1).isBlank() && !sheet_curr_day.getRange(i, 3, 1, 1).isBlank() ) {
        //Do an automatic check-out
        sheet_curr_day.getRange(i, 2, 1, 1).setValue("Out")
        numIN = liveCount([numIN]); //Call liveCount to obtain current numIN       
        var day = new Date().toDateString()
        var checkOutTime = Utilities.formatDate(new Date(), "GMT-4", "h:mm:ss a");//New York time zone
        var action = "No Checkout"
        var name = sheet_curr_day.getRange(i, 1, 1, 1).getValue()
        var details = ['', action, name,]
                       if (SEND_TO_SLACK) {
                       //Send to Slack
                       sendToSlack(details)
                       }
        msg = "Automatic check-out";
        var checkOutDetailsCondensed = [checkOutTime, msg]
        sheet_curr_day.getRange(i, 4, 1, 2).setValues([checkOutDetailsCondensed])
        
        //Put automatic checkOut information on Event Log
        var checkOutDetails = [day, action, name, checkOutTime, numIN, msg]
        sheet.getRange(lastRow + 1, 1, 1, 6).setValues([checkOutDetails])
        sheet_curr_day.getRange(1, 2).setValue(numIN)
      }
    }                                        
  }                 
}                  

                      
function doPost(e) {
  if (typeof e !== 'undefined') {
    switch (e.parameter.command) {
      case CHECK_IN_COMMAND:
        Logger.log('Just about to call the handleCheckIn');
        return handleCheckIn(e);
      case CHECK_OUT_COMMAND:
        return handleCheckOut(e);
      default:
        return ContentService.createTextOutput('Unknown command');
    }
  }
}

     
function autoClear(a) {
  // set up spreadsheet
  var col = 2
  var row_old = 3
  var row_new = row_old + LAB_TOTAL + 3
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow()
  
  // copy previous day down
  var row_num = LAB_TOTAL
  var old_range = sheet_curr_day.getRange(row_old, col, LAB_TOTAL, 5)
  var new_range = sheet_curr_day.getRange(row_new, col, LAB_TOTAL, 5)
  old_range.copyTo(new_range)
  
  // clear previous day
  col = 3
  var old_range = sheet_curr_day.getRange(row_old, col, LAB_TOTAL, 3).setValue(["",""]);
  
  // update dates
  var old_date = sheet_curr_day.getRange(1, 1, 1, 1).getValue()
  sheet_curr_day.getRange(14, 1, 1, 1).setValue(old_date)
  var new_date = new Date().toDateString()
  sheet_curr_day.getRange(1, 1, 1, 1).setValue(new_date)
}


function handleCheckIn(e) { 
  // set up spreadsheet
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow();
  var action = CHECK_IN_ACTION;
  var numIN = 0;
  
  //extract data from slack request
  var parameter = e.parameter;
  var name = parameter.text;
  
  //Validate person and determine which row corresponds to the person checking in
  //Also sends a personalized message to lab members depending on their personal circumstances.
  //See some examples below for PERSON03, PERSON09, PERSON10
  var currentRow
  switch (name) {
    case PERSON01:
      currentRow = 3;
      break;
    case PERSON02:
      currentRow = 4;
      break;
    case PERSON03:
      currentRow = 5;
      var msg = "Wait: You are supposed to be writing your thesis! Back to the :books: for you!\n:female-scientist: Exiting without checking you in.'"
      return ContentService.createTextOutput(msg);
      break;
    case PERSON04:
      currentRow = 6;
      break;
    case PERSON05:
      currentRow = 7;
      break;
    case PERSON06:
      currentRow = 8;
      break;
    case PERSON07:
      currentRow = 9;
      break;
    case PERSON08:
      currentRow = 10;
      break;
    case PERSON09:
      currentRow = 11;
      var msg = "We :heart: our WonderGrads and can't wait until they are allowed back in the lab:!\n:female-scientist: Exiting without checking you in.'"
      return ContentService.createTextOutput(msg);
      break;
    case PERSON10:
      currentRow = 12;
      var msg = "Hey: You are supposed to be writing code, creating a special :snowflake: or riding your :bike:!\n:female-scientist: Exiting without checking you in.'"
      return ContentService.createTextOutput(msg);
      break;
    default:
      return ContentService.createTextOutput([NAME_ERR]);
      break;
  } 
  
  //Determine if person is already checked in so they are not counted twice
  var currentStatus = sheet_curr_day.getRange(currentRow,2).getValue();
  if ( currentStatus == "In" ) {
    if ( !sheet_curr_day.getRange(currentRow, 3, 1, 1).isBlank()  ) { 
      var msg = "You are already checked in.\n':female-scientist: Hope you are having a great day in Lab! :tada:';"
      return ContentService.createTextOutput(msg);
    } else {
      var msg = "You are already checked in but your time is missing. Updating your time....\n':female-scientist: Hope you are having a great day in Lab! :tada:';"
      var checkInTime = Utilities.formatDate(new Date(), "GMT-4", "hh:mm:ss a");//New York time zone
      sheet_curr_day.getRange(currentRow, 3, 1, 1).setValue([checkInTime]);
      return ContentService.createTextOutput(msg);
    };
  };
  
  //Count the number of researchers currently in lab
  numIN = liveCount([numIN]); //Call liveCount to obtain current numIN         
  //Determine if check-in would exceed maximum number allowed
  var update_override = true
  if (numIN >= LAB_LIMIT ) {
    switch(OVERRIDE_OPT){
      case 'WARN':
        // Still allows check-in for a temporary, brief period of time and sends a warning. 
        break;
      case 'FORBID':
        return_text = `You cannot check into lab at this time because the lab limit of ${LAB_LIMIT} has been reached.`;
        update_override = false
        return ContentService.createTextOutput(return_text);
        break;
      default:
        return_text ='default text';
        break
    }
  }
  
  //Execute the check-in and post to google sheet 
  if (update_override) {
    var checkInTime = Utilities.formatDate(new Date(), "GMT-4", "hh:mm:ss a");//New York time zone
    var date = new Date().toDateString()
    
    numIN +=1 
    sheet_curr_day.getRange(1, 2).setValue(numIN)  
    var checkInDetails = [date, action, name, checkInTime,numIN]
    var checkInDetailsCondensed = ["In", checkInTime]
    
    sheet.getRange(lastRow + 1,1, 1, 5).setValues([checkInDetails])
    sheet_curr_day.getRange(currentRow, 2, 1, 2).setValues([checkInDetailsCondensed])
    //Send to Slack
    if (SEND_TO_SLACK) {
      sendToSlack(checkInDetails)
    }
  } 
  if ( numIN <= LAB_LIMIT ) {
    return_text =':female-scientist: Have a great day in Lab! :tada:'
    return ContentService.createTextOutput(return_text);
  } else {
    return_text ='WARNING: Your entry would exceed the maximum number of ' + LAB_LIMIT + ' researchers allowed.\n If you absolutely must enter, make it brief.\n:female-scientist: Have a great day in Lab! :tada:'
    return ContentService.createTextOutput(return_text);
  }
}


function handleCheckOut(e) {
  // set up spreadsheet
  var numIN = 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  var sheet_curr_day = ss.getSheetByName(SHEET_CURR_DAY);
  var lastRow = sheet.getLastRow()
  var action = CHECK_OUT_ACTION  
  //Extract name from slack
  var parameter = e.parameter;
  var name = parameter.text;  
  //Validate person and determine which row corresponds to the person checking in
  var currentRow
  switch (name) {
    case PERSON01:
      currentRow = 3;
      break;
    case PERSON02:
      currentRow = 4;
      break;
    case PERSON03:
      currentRow = 5;
      break;
    case PERSON04:
      currentRow = 6;
      break;
    case PERSON05:
      currentRow = 7;
      break;
    case PERSON06:
      currentRow = 8;
      break;
    case PERSON07:
      currentRow = 9;
      break;
    case PERSON08:
      currentRow = 10;
      break;
    case PERSON09:
      currentRow = 11;
      break;
    case PERSON10:
      currentRow = 12;
      break;     
    default:
      return ContentService.createTextOutput([NAME_ERR]);
      break;
  }
  
  //Determine if person has already checked out
  var currentStatus = sheet_curr_day.getRange(currentRow,2,1,1).getValue();
  Logger.log('Karen current status is %s',currentStatus);
  if ( currentStatus == "Out" ) {
    var msg = "\n:boom: You are already checked out!:boom:\n :female-scientist:You have to check-in before you can check-out\n"
    return ContentService.createTextOutput(msg);
  }  
  //Write to the Event Log and Current Day Sheet
  var checkOutTime = Utilities.formatDate(new Date(), "GMT-4", "h:mm:ss a");//New York time zone
  var day = new Date().toDateString()
  var checkOutDetailsCondensed = [checkOutTime]
  sheet_curr_day.getRange(currentRow, 2, 1, 1).setValue("Out")
  sheet_curr_day.getRange(currentRow, 4, 1, 1).setValues([checkOutDetailsCondensed])  
  //Count the number of researchers in lab
  numIN = liveCount([numIN]); //Call liveCount to obtain current numIN       
  var checkOutDetails = [day, action, name, checkOutTime, numIN]
  sheet.getRange(lastRow + 1, 1, 1, 5).setValues([checkOutDetails])
  sheet_curr_day.getRange(1, 2).setValue(numIN)
  //Send to Slack
  if (SEND_TO_SLACK) {
    sendToSlack(checkOutDetails)
  }
  return ContentService.createTextOutput('\n:wave: See you next time! :tada:\n'); 
}


// Function to send message to Slack
function sendToSlack(details) {
  var timestamp = new Date();
  
  if ( details[1] == CHECK_IN_ACTION && details[4] <= LAB_LIMIT ) {
    var payload = {
      "channel": CHECK_IN_CHANNEL,
      "username": "Check-In Bot",
      "text": details[2] + " has checked in to lab.\n There are now " + details[4] + " total researchers in lab"
    };
  } else if ( details[1] == CHECK_IN_ACTION && details[4] > LAB_LIMIT ) {
    var payload = {
      "channel": CHECK_IN_CHANNEL,
      "username": "Check-In Bot",
      "text": details[2] + " has checked into lab.\n WARNING: There are now " + details[4] + " total researchers in lab.\n This exceeds our max allowed of " + LAB_LIMIT + " so make your visit brief."
    };
  } else if ( details[1] == CHECK_OUT_ACTION ) {
    var payload = {
      "channel": CHECK_IN_CHANNEL,
      "username": "Check-In Bot",
      "text": details[2] + " has checked out of lab.\n There are now " + details[4] + " total researchers in lab"
    };
    
  } else if ( details[1] == NO_CHECK_OUT_ACTION ) {
    var payload = {
      "channel": CHECK_IN_CHANNEL,
      "username": "Check-In Bot",
      "text": ":bangbang: WARNING :bangbang: " + details[2] + " has NOT checked out of lab, make sure they are okay."
    };
  } else {
    var payload = {
      "channel": CHECK_IN_CHANNEL,
      "username": "Check-In Bot",
      "text": "Please contact Karen if you see this. What is in the details: " + details
    };
  }
  var options = {
    "method": "post",
    "contentType": "application/json",
    "payload": JSON.stringify(payload)
  };
  
  return UrlFetchApp.fetch(url,options);
}

// This script was originally created by Sophie Shoemaker Updated: 06/20/2020
// and was edited to change some functionality by Karen Fleming: 08/31/2020

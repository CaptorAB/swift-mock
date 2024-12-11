/* eslint-disable operator-linebreak */
/* eslint-disable quotes */
module.exports.parse = (input) => {
  const result = {};
  result.content = input;
  result.blockId = 2;

  let pattern =
    /O(?<MsgType>\d{3})(?<InputTime>\d{4})(?<InputDate>\d{6})(?<Bic>\w*?)(?<Session>\w{4})(?<Sequence>\w{6})(?<OutputDate>\d{6})(?<OutputTime>\d{4})(?<Prio>[SNU])/;
  let match = input.match(pattern);
  if (match != null) {
    result.direction = "O";
    result.msgType = match.groups.MsgType;
    result.inputTime = match.groups.InputTime;
    result.inputDate = match.groups.InputDate;
    result.bic = match.groups.Bic;
    result.sessionNumber = match.groups.Session;
    result.sequenceNumber = match.groups.Sequence;
    result.outputDate = match.groups.OutputDate;
    result.outputTime = match.groups.OutputTime;
    result.prio = match.groups.Prio;
    return result;
  }

  pattern =
    /I(?<MsgType>\d{3})(?<Bic>\w{7,12})(?<Prio>[SNU])(?<MonitoringField>[123])?(?<Obsolescence>\d{3})?/;
  match = input.match(pattern);
  if (match != null) {
    result.direction = "I";
    result.msgType = match.groups.MsgType;
    result.bic = match.groups.Bic;
    result.prio = match.groups.Prio;
    result.monitoringField = match.groups.MonitoringField;
    result.obsolescence = match.groups.Obsolescence;
  }

  return result;
};

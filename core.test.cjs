const {test} = require('node:test');
const assert = require('node:assert/strict');
const {trackingDay,monday,monthShift,totals,summarize,initial,validate,getTarget,massToKg,massFromKg} = require('./core.js');

test('04:00 boundary and configurable cutoff', () => {
  assert.equal(trackingDay(new Date(2026,10,17,1,30),'04:00'),'2026-11-16');
  assert.equal(trackingDay(new Date(2026,10,17,3,59),'04:00'),'2026-11-16');
  assert.equal(trackingDay(new Date(2026,10,17,4),'04:00'),'2026-11-17');
  assert.equal(trackingDay(new Date(2026,10,17,4),'04:30'),'2026-11-16');
  assert.equal(trackingDay(new Date(2027,0,1,0),'04:00'),'2026-12-31');
});
test('daylight-saving dates use wall-clock time, and weeks begin Monday', () => {
  assert.equal(trackingDay(new Date(2026,2,29,2,59),'04:00'),'2026-03-28');
  assert.equal(trackingDay(new Date(2026,2,29,4),'04:00'),'2026-03-29');
  assert.equal(trackingDay(new Date(2026,9,25,3,30),'04:00'),'2026-10-24');
  assert.equal(monday('2026-11-22'),'2026-11-16');
  assert.equal(monday('2026-11-23'),'2026-11-23');
  assert.equal(monthShift('2026-12-29',1),'2027-01-01');
});
test('empty days, incomplete protein and genuine zero stay distinct', () => {
  assert.deepEqual(totals([]),{calories:null,protein:null,unknown:0});
  assert.deepEqual(totals([{calories:700,protein:null}]),{calories:700,protein:null,unknown:1});
  assert.deepEqual(totals([{calories:700,protein:null},{calories:0,protein:0}]),{calories:700,protein:0,unknown:1});
  assert.equal(totals([{calories:10,protein:2},{calories:10,protein:3}]).protein,5);
});
test('the protein average uses known totals and target counts exclude incomplete days', () => {
  const target = {calories:500,protein:20};
  const rows = [[],[{calories:500,protein:30},{calories:20,protein:null}],[{calories:0,protein:0}]].map(entries=>({...totals(entries),target}));
  assert.deepEqual(summarize(rows,'protein'),{count:2,mean:15,high:30,low:0,reached:0,eligible:1});
  assert.deepEqual(summarize(rows,'calories'),{count:2,mean:260,high:520,low:0,reached:1,eligible:2});
});
test('target history uses the last applicable day', () => {
  const history = [{day:'2026-11-11',calories:2000},{day:'2026-11-14',calories:2400}];
  assert.equal(getTarget(history,'2026-11-12').calories,2000);
  assert.equal(getTarget(history,'2026-11-14').calories,2400);
  assert.deepEqual(getTarget(history,'2026-11-10'),{});
});
test('backup validates missing values, dates and body measurement ranges', () => {
  const backup = initial();
  assert.equal(validate(backup),true);
  backup.entries.push({id:'entry',name:'Dinner',day:'2026-11-16',time:'23:50',calories:700,protein:null});
  backup.body.push({day:'2026-11-15',weight:null,fat:19.2,muscle:42.5});
  assert.equal(validate(JSON.parse(JSON.stringify(backup))),true);
  backup.body[0].muscle = 101;
  assert.equal(validate(backup),false);
  backup.body[0].muscle = null;
  backup.entries[0].day = '2026-02-31';
  assert.equal(validate(backup),false);
});

test('kg and lb convert through kilograms without losing precision', () => {
  assert.equal(massToKg(100,'lb'),45.359237);
  assert.equal(massFromKg(45.359237,'lb'),100);
  assert.equal(massToKg(80,'kg'),80);
  assert.equal(massFromKg(null,'lb'),null);
});
test('legacy percentages and new mass readings are both valid', () => {
  const backup = initial();
  delete backup.prefs.massUnit;
  backup.body.push({day:'2026-11-15',weight:null,fat:null,muscle:39});
  assert.equal(validate(backup),true);
  backup.prefs.massUnit = 'lb';
  backup.body.push({day:'2026-11-22',weight:null,fat:null,muscleKg:34});
  assert.equal(validate(backup),true);
  backup.body[1].muscleKg = -1;
  assert.equal(validate(backup),false);
});

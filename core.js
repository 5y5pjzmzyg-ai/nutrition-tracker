'use strict';
const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const categories = ['Breakfast','Lunch','Dinner','Snack','Drink','Other'];
const metrics = [['weight','Weight','kg'],['fat','Body fat','%'],['muscleKg','Skeletal muscle','kg']];
const KG_PER_LB = 0.45359237;
const massToKg = (value,unit) => value === null ? null : unit === 'lb' ? value * KG_PER_LB : value;
const massFromKg = (value,unit) => value == null ? null : unit === 'lb' ? value / KG_PER_LB : value;
const shift = (day, offset) => {
  const date = new Date(day + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0,10);
};
const pair = value => String(value).padStart(2,'0');
const localDay = date => [date.getFullYear(), pair(date.getMonth()+1), pair(date.getDate())].join('-');
const localTime = date => pair(date.getHours())+':'+pair(date.getMinutes());
const trackingDay = (date, boundary) => shift(localDay(date), localTime(date) < boundary ? -1 : 0);
const weekday = day => new Date(day+'T12:00:00Z').getUTCDay();
const monday = day => shift(day, -((weekday(day)+6)%7));
const monthShift = (day, offset) => {
  const date = new Date(day.slice(0,7)+'-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth()+offset);
  return date.toISOString().slice(0,10);
};
const number = value => value === '' ? null : Number(value);
const format = value => new Intl.NumberFormat('en-GB',{maximumFractionDigits:2}).format(value);
const prettyDay = day => new Intl.DateTimeFormat('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));
const getTarget = (targets, day) => targets.slice().reverse().find(item => item.day <= day) || {};
function totals(entries) {
  if (!entries.length) return {calories:null,protein:null,unknown:0};
  const known = entries.filter(entry => entry.protein !== null);
  return {
    calories: entries.reduce((sum,entry) => sum+entry.calories,0),
    protein: known.length ? known.reduce((sum,entry) => sum+entry.protein,0) : null,
    unknown: entries.length-known.length,
  };
}
function summarize(rows, metric) {
  const values = rows.map(row => row[metric]).filter(value => value !== null);
  const eligible = rows.filter(row => row[metric] !== null && row.target[metric] != null && (metric !== 'protein' || !row.unknown));
  return {
    count:values.length,
    mean:values.length ? values.reduce((sum,value) => sum+value,0)/values.length : null,
    high:values.reduce((high,value) => Math.max(high,value),-Infinity),
    low:values.reduce((low,value) => Math.min(low,value),Infinity),
    reached:eligible.filter(row => row[metric] >= row.target[metric]).length,
    eligible:eligible.length,
  };
}
const initial = () => ({version:1,entries:[],foods:[],body:[],targets:[],prefs:{boundary:'04:00',measure:0,sort:'name',massUnit:'kg'}});
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && shift(day,0) === day;
const validTime = time => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
const numeric = (value,min=0,max=Infinity) => Number.isFinite(value) && value >= min && value <= max;
const nullable = (value,min,max) => value === null || numeric(value,min,max);
const label = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 120;
function validate(data) {
  const unique = (rows,key) => Array.isArray(rows) && rows.every(row => row && label(row[key])) && new Set(rows.map(row => row[key])).size === rows.length;
  return data?.version === 1 && validTime(data.prefs?.boundary) && Number.isInteger(data.prefs.measure)
    && data.prefs.measure >= 0 && data.prefs.measure < 7 && ['name','frequency'].includes(data.prefs.sort)
    && (data.prefs.massUnit === undefined || ['kg','lb'].includes(data.prefs.massUnit))
    && unique(data.entries,'id') && data.entries.every(row => validDay(row.day) && validTime(row.time) && label(row.name) && numeric(row.calories) && nullable(row.protein) && (row.foodId == null || label(row.foodId)))
    && unique(data.foods,'id') && data.foods.every(row => label(row.name) && numeric(row.calories) && numeric(row.protein) && typeof row.serving === 'string' && row.serving.length <= 120)
    && unique(data.body,'day') && data.body.every(row => validDay(row.day) && (row.weight === null || (numeric(row.weight) && row.weight > 0)) && nullable(row.fat,0,100) && (row.muscle === undefined || nullable(row.muscle,0,100))
      && (row.muscleKg == null || (numeric(row.muscleKg) && row.muscleKg > 0))
      && (row.muscle != null || metrics.some(([key]) => row[key] != null)))
    && unique(data.targets,'day') && data.targets.every((row,index,rows) => validDay(row.day) && (!index || rows[index-1].day < row.day) && nullable(row.calories,1) && nullable(row.protein,1));
}
if (typeof module !== 'undefined') module.exports = {shift,trackingDay,monday,monthShift,totals,summarize,initial,validate,getTarget,massToKg,massFromKg};

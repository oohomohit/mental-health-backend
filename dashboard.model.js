const mongoose = require('mongoose');

const dashboardSchema = new mongoose.Schema({
  heartRateAvg: Number,
  totalSteps: Number,
  sleepDuration: Number,
  activity: Number,
  oxygenAvg: Number,
  temperature: Number,
}, {
  timestamps: true
});

const Dashboard = mongoose.model('Dashboard', dashboardSchema);
module.exports = Dashboard;

const mongoose = require('mongoose');

const dashboardSchema = new mongoose.Schema({
  heartRateAvg: { type: Number, required: true },
  totalSteps: { type: Number, required: true },
  sleepDuration: { type: Number, required: true },
  oxygenAvg: { type: Number, required: false, default: null },
  temperature: { type: Number, required: false, default: null },
}, {
  timestamps: true
});


const Dashboard = mongoose.model('Dashboard', dashboardSchema);
module.exports = Dashboard;

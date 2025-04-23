const mongoose = require('mongoose');

const dashboardSchema = new mongoose.Schema({
  email: { type: String, required: true},
  heartRateAvg: { type: Number, required: true },
  totalSteps: { type: Number, required: true },
  sleepDuration: { type: String, required: false },
  oxygenAvg: { type: Number, required: false, default: null },
  temperature: { type: Number, required: false, default: null },
}, {
  timestamps: true
});


const Dashboard = mongoose.model('Dashboard', dashboardSchema);
module.exports = Dashboard;

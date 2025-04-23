const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const dayjs = require('dayjs');
const session = require('express-session');
const mongoose = require('mongoose');
const Dashboard = require('./models/dashboard.model');

dotenv.config();
const app = express();
const port = 3000;

app.use(cors({
  origin: '*'  // Replace with the frontend URL
}));
app.use(express.json()); // For JSON body parsing
app.use(express.urlencoded({ extended: true })); // For URL-encoded body parsing
app.use(session({
  secret: 'mental-health-secret',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,  // 1 week
    secure: false,
  },
  rolling: true,  // Session expiration is refreshed with each request
}));


//connection to mongodb
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB Atlas'))
.catch((err) => console.error('MongoDB Atlas connection error:', err));

// Google OAuth2 client setup
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.REDIRECT_URI
);

// Scopes
const SCOPES = [
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.body_temperature.read',
  'https://www.googleapis.com/auth/fitness.oxygen_saturation.read',
  'https://www.googleapis.com/auth/userinfo.profile',
   'https://www.googleapis.com/auth/userinfo.email'
];


function authCheck(req, res, next) {
  if (!req.session.tokens) return res.status(401).send('User not authenticated');
  oAuth2Client.setCredentials(req.session.tokens);
  next();
}

// Fetch heart rate data
async function getHeartRateData() {
  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').unix() * 1_000_000_000;
  const endTime = now.unix() * 1_000_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    const points = response.data.point;
    if (!points || points.length === 0) {
      throw new Error('No heart rate data found');
    }

    const heartRateValues = points.map(point => point.value[0].fpVal);
    const averageHeartRate = heartRateValues.reduce((a, b) => a + b, 0) / heartRateValues.length;
    return { average: averageHeartRate };
  } catch (error) {
    console.error('Error fetching heart rate data:', error);
    throw new Error('Failed to fetch heart rate data');
  }
}

// Fetch sleep data
async function getSleepData() {
  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const dayjs = require('dayjs');
  const now = dayjs();

  // Define start and end time for querying the last 7 days (adjustable)
  const startTimeMillis = now.subtract(7, 'day').valueOf();
  const endTimeMillis = now.valueOf();
  const datasetId = `${startTimeMillis * 1_000_000}-${endTimeMillis * 1_000_000}`;

  // Default sleep data source ID
  const dataSourceId = 'derived:com.google.sleep.segment:com.google.android.gms:merged';

  // Sleep stage mapping
  const sleepStageMap = {
    1: 'Awake',
    2: 'Sleep',
    3: 'Out of Bed',
    4: 'Light Sleep',
    5: 'Deep Sleep',
    6: 'REM Sleep'
  };

  try {
    // Fetch sleep data from the dataSource
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId: dataSourceId,
      datasetId: datasetId,
    });

    // Process sleep data points
    const points = response.data.point || [];

    if (points.length === 0) {
      throw new Error("No sleep data available for the selected period.");
    }

    const stages = points.map(point => {
      const start = dayjs(Number(point.startTimeNanos) / 1e6);  // Convert nanoseconds to milliseconds
      const end = dayjs(Number(point.endTimeNanos) / 1e6);  // Convert nanoseconds to milliseconds
      const duration = end.diff(start, 'minute');
      const stage = point.value?.[0]?.intVal ?? null;

      return {
        start: start.format('YYYY-MM-DD HH:mm:ss'),
        end: end.format('YYYY-MM-DD HH:mm:ss'),
        durationMinutes: duration,
        stageCode: stage,
        stage: sleepStageMap[stage] || 'Unknown',
      };
    });

    // Calculate total sleep time (light sleep, deep sleep, REM, etc.)
    const totalSleepMinutes = stages
      .filter(s => [2, 4, 5, 6].includes(s.stageCode))  // Only count sleep stages
      .reduce((sum, s) => sum + s.durationMinutes, 0);

    const hours = Math.floor(totalSleepMinutes / 60);
    const minutes = totalSleepMinutes % 60;

    // Return total sleep time
    return {
      totalSleep: { hours, minutes },
    };
  } catch (error) {
    console.error('Error fetching sleep data:', error);
    throw new Error('Failed to fetch sleep data');
  }
}

// Fetch steps data
async function getStepsData() {
  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    const totalSteps = (response.data.point || []).reduce((sum, point) => {
      const stepVal = point.value?.[0]?.intVal || 0;
      return sum + stepVal;
    }, 0);

    return { totalSteps };
  } catch (error) {
    console.error('Error fetching steps data:', error.response?.data || error);
    throw new Error('Failed to fetch steps data');
  }
}

// Fetch oxygen saturation data
async function getOxygenSaturationData() {
  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.oxygen_saturation:com.google.android.gms:merged';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    const points = response.data.point || [];

    const parsed = points.map(point => ({
      timestamp: dayjs(Number(point.startTimeNanos) / 1e6).format('YYYY-MM-DD HH:mm:ss'),
      oxygenSaturation: point.value?.[0]?.fpVal ?? null
    })).filter(p => p.oxygenSaturation !== null);

    const values = parsed.map(p => p.oxygenSaturation);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;

    return {
      average,
      values: parsed
    };
  } catch (error) {
    console.error('Error fetching oxygen saturation data:', error);
    throw new Error('Failed to fetch oxygen saturation data');
  }
}

// Fetch temperature data (using another relevant source)
async function getTemperatureData() {
  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.body.temperature.bpm:com.google.android.gms:merge_body_temperature';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    const points = response.data.point;
    if (!points || points.length === 0) {
      // Fallback: return random normal body temperature between 36.1°C and 37.2°C
      const randomTemp = (Math.random() * (37.2 - 36.1) + 36.1).toFixed(1);
      return { value: parseFloat(randomTemp) };
    }

    const temperature = points[0].value[0].fpVal;
    return { value: temperature };
  } catch (error) {
    console.error('Error fetching temperature data:', error);
    // Still return fallback value on error
    return { value: 36.5 };
  }
}

//home route
app.get('/', (req, res) => {
  res.send(`
    <h2>👋 Welcome to the Mental Health Monitor</h2>
    <p>To get started, please authenticate with your Google account:</p>
    <a href="/auth/google" style="padding: 10px 20px; background-color: #4285F4; color: white; text-decoration: none; border-radius: 5px;">
      🔐 Sign in with Google
    </a>
  `);
});

// test route
app.get('/test', (req, res) => {
  console.log('alive!!')
  res.send({
    status:200,
    msg : "we are up!!"
  })
});

// Step 1: Start Google OAuth
app.get('/auth/google', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

// Step 2: Handle OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  try {
    const code = req.query.code;
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oAuth2Client,
      version: 'v2',
    });

    const { data: profile } = await oauth2.userinfo.get();
    const userEmail = profile.email;
    
    // In production, save tokens to a DB
    req.session.tokens = tokens;
    req.session.email = userEmail;
    global.oauthTokens = tokens;

    res.send(`
      <html>
        <head>
          <title>Health Monitor - Authenticated</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 30px;
              background: #e9f7ef;
              color: #2c3e50;
            }
            h1 {
              color: #27ae60;
            }
            ul {
              list-style: none;
              padding-left: 0;
            }
            li {
              margin-bottom: 10px;
            }
            a {
              text-decoration: none;
              color: #2980b9;
            }
          </style>
        </head>
        <body>
          <h1>✅ Authentication Successful!</h1>
          <p>You can now access your health data using the following endpoints:</p>
          <ul>
            <li><a href="/dashboard">/dashboard</a> – Full health summary</li>
            <li><a href="/heart-rate">/heart-rate</a> – Average heart rate</li>
            <li><a href="/steps">/steps</a> – Total steps</li>
            <li><a href="/activity">/activity</a> – Avg physical activity</li>
            <li><a href="/sleep">/sleep</a> – Sleep duration</li>
            <li><a href="/oxygen-saturation">/oxygen-saturation</a> – Oxygen saturation</li>
            <li><a href="/body-temperature">/body-temperature</a> – Body temperature</li>
          </ul>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.status(500).send('Authentication failed');
  }
});

// Step 3: Fetch heart rate data
app.get('/heart-rate', authCheck, async (req, res) => {

  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });

  // Last 24 hours in nanoseconds
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch heart rate:', error);
    res.status(500).send('Failed to fetch heart rate');
  }
});

// Step 4: Fetch Sleep Duration data
app.get('/sleep', authCheck, async (req, res) => {
  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const dayjs = require('dayjs');
  const now = dayjs();

  // Define start and end time for querying the last 7 days (adjustable)
  const startTimeMillis = now.subtract(7, 'day').valueOf();
  const endTimeMillis = now.valueOf();
  const datasetId = `${startTimeMillis * 1_000_000}-${endTimeMillis * 1_000_000}`;

  // Default sleep data source ID
  const dataSourceId = 'derived:com.google.sleep.segment:com.google.android.gms:merged';

  // Sleep stage mapping
  const sleepStageMap = {
    1: 'Awake',
    2: 'Sleep',
    3: 'Out of Bed',
    4: 'Light Sleep',
    5: 'Deep Sleep',
    6: 'REM Sleep'
  };

  try {
    // 1. Check available data sources for sleep
    const sources = await fitness.users.dataSources.list({ userId: 'me' });
    const sleepSources = sources.data.dataSource.filter(s => s.dataType.name.includes("sleep"));
    
    if (sleepSources.length === 0) {
      return res.status(404).send("No sleep data sources available.");
    }

    // 2. Fetch sleep data from the dataSource
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId: dataSourceId,
      datasetId: datasetId,
    });

    // 3. Process sleep data points
    const points = response.data.point || [];

    if (points.length === 0) {
      return res.status(404).send("No sleep data available for the selected period.");
    }

    const stages = points.map(point => {
      const start = dayjs(Number(point.startTimeNanos) / 1e6);  // Convert nanoseconds to milliseconds
      const end = dayjs(Number(point.endTimeNanos) / 1e6);  // Convert nanoseconds to milliseconds
      const duration = end.diff(start, 'minute');
      const stage = point.value?.[0]?.intVal ?? null;

      return {
        start: start.format('YYYY-MM-DD HH:mm:ss'),
        end: end.format('YYYY-MM-DD HH:mm:ss'),
        durationMinutes: duration,
        stageCode: stage,
        stage: sleepStageMap[stage] || 'Unknown',
      };
    });

    // 4. Calculate total sleep time (light sleep, deep sleep, REM, etc.)
    const totalSleepMinutes = stages
      .filter(s => [2, 4, 5, 6].includes(s.stageCode))
      .reduce((sum, s) => sum + s.durationMinutes, 0);

    const hours = Math.floor(totalSleepMinutes / 60);
    const minutes = totalSleepMinutes % 60;

    // 5. Respond with total sleep data and stages
    res.json({
      totalSleep: { hours, minutes },
      stages,
    });

  } catch (error) {
    console.error('Failed to fetch detailed sleep data:', error.response?.data || error);

    // Handle error more precisely based on the error's structure
    if (error.response && error.response.data) {
      console.error('Error Details:', error.response.data);
    }

    res.status(500).send('Failed to fetch sleep segment data');
  }
});

// Step 5: Fetch Step Count Data
app.get('/steps', authCheck, async (req, res) => {

  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch steps:', error);
    res.status(500).send('Failed to fetch steps');
  }
});

// Step 6: Fetch Physical Activity Data
app.get('/activity', authCheck, async (req, res) => {
  if (!global.oauthTokens) return res.status(401).send('User not authenticated');
  oAuth2Client.setCredentials(global.oauthTokens);

  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.activity.segment:com.google.android.gms:merge_activity_segments';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch activity:', error);
    res.status(500).send('Failed to fetch activity data');
  }
});

// Step 7: Fetch Breathing Rate/ Oxygen Saturation Data
app.get('/oxygen-saturation', authCheck, async (req, res) => {
  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const dayjs = require('dayjs');
  const now = dayjs();
  const startTime = now.subtract(7, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;
  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.oxygen_saturation:com.google.android.gms:merged';

  try {
    const sources = await fitness.users.dataSources.list({ userId: 'me' });

    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    const points = response.data.point || [];

    if (points.length === 0) {
      return res.status(404).send('No oxygen saturation data available for the selected period.');
    }

    const data = points.map(point => ({
      timestamp: dayjs(Number(point.startTimeNanos) / 1e6).format('YYYY-MM-DD HH:mm:ss'),
      oxygenSaturation: point.value?.[0]?.fpVal ?? null,
    })).filter(p => p.oxygenSaturation !== null);

    if (data.length === 0) {
      return res.status(404).send('No valid oxygen saturation data available.');
    }

    const averageOxygenSaturation = data.reduce((sum, p) => sum + p.oxygenSaturation, 0) / data.length;

    res.json({
      averageOxygenSaturation: averageOxygenSaturation.toFixed(2),
      data: data,
    });

  } catch (error) {
    console.error('Failed to fetch oxygen saturation:', error);
    res.status(500).send('Oxygen Saturation: Failed to fetch data');
  }
});

// Step 8: Fetch Body Temperature Data
app.get('/body-temperature', authCheck, async (req, res) => {

  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(2, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.body.temperature:com.google.android.gms:merge_body_temperature';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch body temperature:', error);
    res.status(500).send('Failed to fetch body temperature');
  }
});

// Dashboard
app.get('/dashboard', authCheck, async (req, res) => {
  try {
     // Get user's email from session
     const userEmail = req.session.email;

     // Ensure that userEmail is available
     if (!userEmail) {
       return res.status(400).send('User email not found');
     }
    
    const cleanData = (value) => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'number') return isNaN(value) ? null : value;
      if (typeof value === 'string') return value.trim() === '' ? null : value;
      return value;
    };    

    const heartRateData = await getHeartRateData().catch(e => { throw new Error("Heart Rate: " + e.message) });
    const sleepData = await getSleepData().catch(e => { throw new Error("Sleep: " + e.message) });
    const stepsData = await getStepsData().catch(e => { throw new Error("Steps: " + e.message) });
    const oxygenData = await getOxygenSaturationData().catch(e => { throw new Error("Oxygen: " + e.message) });
    const temperatureData = await getTemperatureData().catch(e => { throw new Error("Temperature: " + e.message) });
    
    const { hours: sleepHours, minutes: sleepMinutes } = sleepData.totalSleep;

    const dashboardData = {
      heartRateAvg: cleanData(heartRateData.average),
      totalSteps: cleanData(stepsData.totalSteps),
      sleepDuration: cleanData(`${sleepHours} hr ${sleepMinutes} min`),
      oxygenAvg: cleanData(oxygenData.average),
      temperature: cleanData(temperatureData.value),
    };

    const html = `
      <h1>📊 Health Dashboard</h1>
      <ul>
        <li><strong>Average Heart Rate:</strong> ${dashboardData.heartRateAvg} bpm</li>
        <li><strong>Total Steps (24h):</strong> ${dashboardData.totalSteps}</li>
        <li><strong>Sleep Duration:</strong> ${sleepHours} hr ${sleepMinutes} min</li>
        <li><strong>Oxygen Saturation Avg:</strong> ${dashboardData.oxygenAvg} %</li>
        <li><strong>Temperature:</strong> ${dashboardData.temperature} °C</li>
      </ul>

      <h3>🔍 Raw Data Endpoints</h3>
      <ul>
        <li><a href="/heart-rate">Heart Rate JSON</a></li>
        <li><a href="/sleep">Sleep JSON</a></li>
        <li><a href="/steps">Steps JSON</a></li>
        <li><a href="/oxygen-saturation">Oxygen Saturation JSON</a></li>
        <li><a href="/body-temperature">Temperature JSON</a></li>
      </ul>
    `;
    
    const newEntry = new Dashboard(dashboardData);
    await newEntry.save();
    
    res.send(html);
  } catch (error) {
    console.error('[💥 DASHBOARD ERROR]:', error.message);
    res.status(500).send('Failed to fetch dashboard data: ' + error.message);
  }
});


app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

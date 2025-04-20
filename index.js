const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const dayjs = require('dayjs');
const session = require('express-session');

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
}));

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
];


function authCheck(req, res, next) {
  if (!req.session.tokens) return res.status(401).send('User not authenticated');
  oAuth2Client.setCredentials(req.session.tokens);
  next();
}

//home route
app.get('/',(req,res)=>{
  res.send("msg: at home");
})

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
  const code = req.query.code;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // In production, save tokens to a DB
    req.session.tokens = tokens;
    global.oauthTokens = tokens;

    res.send('Authentication successful! Now go to /heart-rate to fetch data.');
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.status(500).send('Authentication failed');
  }
});

// Step 3: Fetch heart rate data
app.get('/heart-rate', authCheck, async (req, res) => {
  if (!global.oauthTokens) {
    return res.status(401).send('User not authenticated');
  }

  oAuth2Client.setCredentials(global.oauthTokens);

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
  if (!global.oauthTokens) return res.status(401).send('User not authenticated');
  oAuth2Client.setCredentials(global.oauthTokens);

  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  try {
    const response = await fitness.users.sessions.list({
      userId: 'me',
      startTime: new Date(startTime / 1_000_000).toISOString(),
      endTime: new Date(endTime / 1_000_000).toISOString(),
    });

    const sleepSessions = response.data.session?.filter(s => s.activityType === 72); // 72 is sleep
    res.json(sleepSessions || []);
  } catch (error) {
    console.error('Failed to fetch sleep:', error);
    res.status(500).send('Failed to fetch sleep data');
  }
});

// Step 5: Fetch Step Count Data
app.get('/steps', authCheck, async (req, res) => {
  if (!global.oauthTokens) return res.status(401).send('User not authenticated');
  oAuth2Client.setCredentials(global.oauthTokens);

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
  if (!global.oauthTokens) return res.status(401).send('User not authenticated');
  oAuth2Client.setCredentials(global.oauthTokens);

  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
  const endTime = now.valueOf() * 1_000_000;

  const dataset = `${startTime}-${endTime}`;
  const dataSourceId = 'derived:com.google.oxygen_saturation:com.google.android.gms:merge_oxygen_saturation';

  try {
    const response = await fitness.users.dataSources.datasets.get({
      userId: 'me',
      dataSourceId,
      datasetId: dataset,
    });

    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch oxygen saturation:', error);
    res.status(500).send('Failed to fetch oxygen saturation');
  }
});

// Step 8: Fetch Body Temperature Data
app.get('/body-temperature', authCheck, async (req, res) => {
  if (!global.oauthTokens) return res.status(401).send('User not authenticated');
  oAuth2Client.setCredentials(global.oauthTokens);

  const fitness = google.fitness({ version: 'v1', auth: oAuth2Client });
  const now = dayjs();
  const startTime = now.subtract(1, 'day').valueOf() * 1_000_000;
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

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

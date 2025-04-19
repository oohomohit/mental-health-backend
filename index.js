const express = require('express');
const { google } = require('googleapis');
const dotenv = require('dotenv');
const dayjs = require('dayjs');

dotenv.config();
const app = express();
const port = 3000;


app.use(cors({
  origin: '*'  // Replace with the frontend URL
}));
app.use(express.json()); // For JSON body parsing
app.use(express.urlencoded({ extended: true })); // For URL-encoded body parsing


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

// Step 1: Start Google OAuth
app.get('/auth/google', (req, res) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(authUrl);
});

app.get('/test', (req, res) => {
  console.log('alive!!')
  res.send({
    status:200,
    msg : "we are up!!"
  })
});

// Step 2: Handle OAuth callback
app.get('/auth/google/callback', async (req, res) => {
  const code = req.query.code;
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // In production, save tokens to a DB
    global.oauthTokens = tokens;

    res.send('Authentication successful! Now go to /heart-rate to fetch data.');
  } catch (err) {
    console.error('Error getting tokens:', err);
    res.status(500).send('Authentication failed');
  }
});

// Step 3: Fetch heart rate data
app.get('/heart-rate', async (req, res) => {
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

app.listen(port, () => {
  console.log(`✅ Server running at http://localhost:${port}`);
});

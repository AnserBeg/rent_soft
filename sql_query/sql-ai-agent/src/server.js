require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const { requireApiKey } = require('./auth');
const { fetchDatabaseSchema } = require('./schema');
const { executeReadOnlyQuery } = require('./query');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN || false }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/v1/schema', requireApiKey, async (_req, res) => {
  try {
    const schema = await fetchDatabaseSchema();
    res.json(schema);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to retrieve database schema.' });
  }
});

app.post('/v1/query', requireApiKey, async (req, res) => {
  try {
    const output = await executeReadOnlyQuery(req.body);
    res.json(output);
  } catch (err) {
    console.error(err);
    const message = err && err.message ? err.message : 'Query failed.';
    const status = /Only SELECT|forbidden|one SQL statement|expected|required|invalid/i.test(message) ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`SQL AI Agent middleware listening on port ${port}`);
});

function requireApiKey(req, res, next) {
  const expected = process.env.GPT_ACTION_API_KEY;
  const provided = req.header('X-Api-Key');

  if (!expected) {
    return res.status(500).json({ error: 'Server is missing GPT_ACTION_API_KEY.' });
  }

  if (!provided || provided !== expected) {
    return res.status(401).json({ error: 'Unauthorized. Missing or invalid X-Api-Key.' });
  }

  return next();
}

module.exports = { requireApiKey };

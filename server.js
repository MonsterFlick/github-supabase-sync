import express from 'express';
import handler from './api/webhook.js';

const app = express();

app.all('/api/webhook', (req, res) => handler(req, res));

const port = 3000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

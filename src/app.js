import express from 'express';
import routes from './routes/index.route.js';
import { sendSuccess, sendError } from './utils/response.js';

const app = express();

// Parse incoming JSON request bodies
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  return sendSuccess(res, 200, 'Server is healthy', { status: 'ok' });
});

app.use('/', routes);

// Unknown routes
app.use((req, res) => {
  return sendError(res, 404, `Route ${req.method} ${req.originalUrl} not found`);
});

// Central error handler
app.use((err, req, res, next) => {
  // Malformed JSON body sent by the client
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'Request body must be valid JSON');
  }

  // Expected client errors (ApiError from services, or 4xx from Express).
  // 5xx errors fall through so internal messages are never exposed.
  if (err.statusCode >= 400 && err.statusCode < 500) {
    return sendError(res, err.statusCode, err.message);
  }

  console.error(err);
  return sendError(res, 500, 'Something went wrong');
});

export default app;

import express from 'express';
import cors from 'cors';
import Redis from 'ioredis';
import path from 'path';

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Serve static files
app.use('/', express.static(path.join(__dirname, '../public')));

// Get list of games
app.get('/api/games', async (_req, res) => {
  try {
    const keys = await redis.keys('game:*');
    const games = await Promise.all(keys.map(async (key) => {
      const id = key.split(':')[1];
      const data = await redis.hgetall(key);
      return { id, name: data.name, description: data.description, created_at: data.created_at };
    }));
    games.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    res.json({ games });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error retrieving games' });
  }
});

// Create a game
app.post('/api/games', async (req, res) => {
  const { name, description, scene_json, code } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'name is required' });
  }
  try {
    const id = (await redis.incr('game_id_counter')).toString();
    const createdAt = new Date().toISOString();
    await redis.hmset(`game:${id}`, {
      name,
      description: description || '',
      scene_json: scene_json || '',
      code: code || '',
      created_at: createdAt,
    });
    res.status(201).json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creating game' });
  }
});

// Get game scene
app.get('/api/games/:id/scene', async (req, res) => {
  const id = req.params.id;
  try {
    const data = await redis.hgetall(`game:${id}`);
    if (!data || !data.name) {
      return res.status(404).json({ error: 'not found' });
    }
    res.json({ scene_json: data.scene_json, code: data.code });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error retrieving game' });
  }
});

// Fallback: serve client index
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/client/index.html'));
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`bobyx server listening on http://localhost:${PORT}`);
});

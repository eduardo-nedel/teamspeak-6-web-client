import express from 'express';
import { info } from 'logger';

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
    info("Health check requested");
    res.send({ status: 'ok' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
    info(`Gateway control plane listening on port ${PORT}`);
});
